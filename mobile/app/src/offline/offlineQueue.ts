/**
 * Офлайн-очередь для закрытия задач (POST /api/tasks/:id/close).
 *
 * Это самая важная бизнес-логика этого инкремента: на стройплощадке связь
 * часто отсутствует или нестабильна, поэтому попытка закрыть задачу (фото + гео)
 * не должна теряться при неудачном запросе — она должна сохраниться локально
 * и автоматически повториться при восстановлении сети.
 *
 * Класс намеренно не содержит ничего специфичного для React Native (никаких
 * AsyncStorage/NetInfo импортов) — это позволяет тестировать всю логику
 * enqueue/persist/flush/retry обычными юнит-тестами (см. offlineQueue.test.ts),
 * без рантайма RN. RN-специфичная обвязка (реальное хранилище, слушатель сети)
 * подключается снаружи через интерфейсы QueueStorage и submit-функцию.
 *
 * Ограничение этого инкремента: очередь — простой JSON-массив в одном файле/ключе
 * хранилища, без конфликтов и полноценной синхронизации (WatermelonDB/RxDB и т.п.).
 * Для одного пользователя и одного типа операции (закрытие задачи) этого достаточно;
 * при добавлении новых офлайн-сценариев стоит рассмотреть более развитую библиотеку
 * синхронизации — см. mobile/README.md.
 */

export interface CloseTaskJobPayload {
  taskId: string;
  companyId: string;
  photoUrl: string;
  geoLat: number;
  geoLng: number;
}

export interface QueuedJob {
  id: string;
  payload: CloseTaskJobPayload;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/** Абстракция над локальным хранилищем — в приложении реализуется через AsyncStorage. */
export interface QueueStorage {
  load(): Promise<QueuedJob[]>;
  save(jobs: QueuedJob[]): Promise<void>;
}

/** Хранилище в памяти — удобно для тестов и как безопасный фолбэк. */
export class InMemoryQueueStorage implements QueueStorage {
  private jobs: QueuedJob[] = [];

  async load(): Promise<QueuedJob[]> {
    return this.jobs.map((job) => ({ ...job }));
  }

  async save(jobs: QueuedJob[]): Promise<void> {
    this.jobs = jobs.map((job) => ({ ...job }));
  }
}

export type SubmitJob = (payload: CloseTaskJobPayload) => Promise<void>;
export type IdFactory = () => string;

let counter = 0;
const defaultIdFactory: IdFactory = () => {
  counter += 1;
  return `job-${Date.now()}-${counter}`;
};

export interface FlushResult {
  succeeded: string[];
  failed: string[];
}

export class OfflineQueue {
  private jobs: QueuedJob[] = [];
  private hydrated = false;
  private readonly storage: QueueStorage;
  private readonly submit: SubmitJob;
  private readonly idFactory: IdFactory;
  private flushing = false;

  constructor(options: { storage: QueueStorage; submit: SubmitJob; idFactory?: IdFactory }) {
    this.storage = options.storage;
    this.submit = options.submit;
    this.idFactory = options.idFactory ?? defaultIdFactory;
  }

  /** Загружает ранее сохранённые задания из хранилища. Нужно вызвать один раз при старте. */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.jobs = await this.storage.load();
    this.hydrated = true;
  }

  getPending(): QueuedJob[] {
    return this.jobs.map((job) => ({ ...job }));
  }

  get size(): number {
    return this.jobs.length;
  }

  /** Ставит задание в очередь и сразу персистит на диск. */
  async enqueue(payload: CloseTaskJobPayload): Promise<QueuedJob> {
    await this.hydrate();
    const job: QueuedJob = {
      id: this.idFactory(),
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    this.jobs = [...this.jobs, job];
    await this.persist();
    return job;
  }

  /**
   * Пытается отправить закрытие задачи немедленно; если запрос не удался
   * (нет сети / ошибка сервера), задание автоматически попадает в очередь
   * вместо того чтобы потеряться.
   */
  async submitOrQueue(payload: CloseTaskJobPayload): Promise<
    { queued: false } | { queued: true; job: QueuedJob }
  > {
    try {
      await this.submit(payload);
      return { queued: false };
    } catch (err) {
      const job = await this.enqueue(payload);
      job.lastError = err instanceof Error ? err.message : String(err);
      await this.persist();
      return { queued: true, job };
    }
  }

  /**
   * Проходит по всем заданиям в очереди и пытается их отправить.
   * Успешные — удаляются, неудачные — остаются в очереди с увеличенным attempts
   * и сохранённым lastError, чтобы их можно было ретраить снова при следующем flush.
   */
  async flush(): Promise<FlushResult> {
    await this.hydrate();
    if (this.flushing) {
      return { succeeded: [], failed: [] };
    }
    this.flushing = true;
    try {
      const succeeded: string[] = [];
      const failed: string[] = [];
      const remaining: QueuedJob[] = [];

      for (const job of this.jobs) {
        try {
          await this.submit(job.payload);
          succeeded.push(job.id);
        } catch (err) {
          failed.push(job.id);
          remaining.push({
            ...job,
            attempts: job.attempts + 1,
            lastError: err instanceof Error ? err.message : String(err),
          });
        }
      }

      this.jobs = remaining;
      await this.persist();
      return { succeeded, failed };
    } finally {
      this.flushing = false;
    }
  }

  private async persist(): Promise<void> {
    await this.storage.save(this.jobs);
  }
}
