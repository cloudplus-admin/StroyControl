import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import {
  addCrewShift,
  advanceSafetyViolation,
  addDefectPhoto,
  addJournalEntry,
  addMessage,
  addQualityPhoto,
  addReaction,
  advanceSupplyRequest,
  AppData,
  closeTask,
  createWorkAct,
  createSupplyRequest,
  createSafetyViolation,
  attachActPdf,
  Lang,
  moveStock,
  Project,
  projects,
  reviewQualityReport,
  reviewTask,
  Role,
  roles,
  saveCrew,
  saveMaterial,
  saveSafetyChecklist,
  seedData,
  submitQualityReport,
  TaskStatus,
  toggleCrew,
  toggleToolIssue,
} from "./src/domain";
import {
  createBackup,
  loadData,
  loadPreferences,
  saveData,
  savePreferences,
  validateBackup,
} from "./src/storage";
import {
  NotificationTarget,
  Tab,
  tabForNotification,
} from "./src/navigation";
import { ApiClient, Session } from "./src/api";
import { loadSession, saveSession } from "./src/auth-storage";
import { syncQueue } from "./src/sync";
import { refreshServerData } from "./src/bootstrap";
import { formatDate, formatDateTime, localeCode, uiCopy, type UiCopy } from "./src/i18n";
import { dateInputToIso, formatDateInput, isoToDateInput } from "./src/dateInput";

const roleFromSession = (session: Session | null, preferred: Role | null): Role | null => {
  const available = (session?.user?.roles ?? []).map((item) => item.code === 'owner' ? 'director' : item.code).filter((code): code is Role => roles.some((item) => item.id === code));
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] ?? null;
};

const tabsByRole: Record<Role, Tab[]> = {
  director: ['home', 'objects', 'tasks', 'feed', 'profile'],
  pm: ['home', 'objects', 'tasks', 'feed', 'profile'],
  foreman: ['home', 'objects', 'tasks', 'feed', 'profile'],
  inspector: ['home', 'tasks', 'quality', 'feed', 'profile'],
  supplier: ['home', 'objects', 'profile'],
  finance: ['home', 'objects', 'feed', 'profile'],
  customer: ['home', 'objects', 'tasks', 'feed', 'profile'],
  subcontractor: ['home', 'objects', 'tasks', 'feed', 'profile'],
  admin: ['home', 'objects', 'tasks', 'feed', 'profile'],
};

function GeoPoint({ lang, latitude, longitude }: { lang: Lang; latitude?: number; longitude?: number }) {
  const c = lang === "uz"
    ? { loading: "Manzil aniqlanmoqda...", unknown: "Manzil aniqlanmadi", label: "StroyControl nuqtasi", place: "Xaritadagi joy", open: "Xaritada ochish" }
    : lang === "en"
      ? { loading: "Detecting address...", unknown: "Address not found", label: "StroyControl location", place: "Map location", open: "Open on map" }
      : { loading: "Определяем адрес...", unknown: "Адрес не определен", label: "Точка StroyControl", place: "Место на карте", open: "Открыть точку на карте" };
  const [address, setAddress] = useState(c.loading);

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    let active = true;
    Location.reverseGeocodeAsync({ latitude, longitude })
      .then(([place]) => {
        if (!active) return;
        const parts = [place?.street, place?.streetNumber, place?.district, place?.city, place?.region]
          .filter(Boolean);
        setAddress(parts.length ? parts.join(", ") : c.unknown);
      })
      .catch(() => active && setAddress(c.unknown));
    return () => { active = false; };
  }, [lang, latitude, longitude]);

  if (latitude === undefined || longitude === undefined) return null;
  const openMap = async () => {
    const label = encodeURIComponent(c.label);
    const url = Platform.select({
      ios: `maps://?q=${label}&ll=${latitude},${longitude}`,
      default: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
    });
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
    }
  };

  return (
    <View style={s.geoCard}>
      <Text style={s.geoTitle}>📍 {c.place}</Text>
      <Text style={s.geoAddress}>{address}</Text>
      <Pressable style={s.geoButton} onPress={openMap}>
        <Text style={s.geoButtonText}>{c.open}</Text>
      </Pressable>
    </View>
  );
}

type QuickAction = "photo" | "violation" | "qr" | "voice";
type PlanningUser = { id: string; fullName: string };
type PlanningSection = { id: string; name: string; stage: string };
const copy = uiCopy;

function PhotoViewer({ uri, headers, compact = false }: { uri: string; headers?: Record<string, string>; compact?: boolean }) {
  const [opened, setOpened] = useState(false);
  const source = { uri, headers };
  return <>
    <Pressable accessibilityRole="button" onPress={() => setOpened(true)}>
      <Image source={source} resizeMode="contain" style={compact ? s.defectPhoto : s.photo} />
    </Pressable>
    <Modal visible={opened} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpened(false)}>
      <View style={s.photoViewer}>
        <Pressable style={s.photoViewerClose} onPress={() => setOpened(false)} hitSlop={12}>
          <Text style={s.photoViewerCloseText}>×</Text>
        </Pressable>
        <ScrollView
          style={s.photoViewerScroll}
          contentContainerStyle={s.photoViewerContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image source={source} resizeMode="contain" style={s.photoViewerImage} />
        </ScrollView>
      </View>
    </Modal>
  </>;
}

async function shareFile(uri: string, name: string, api: ApiClient | null) {
  let localUri = uri;
  if (/^https?:\/\//.test(uri)) {
    const token = api?.getSession()?.accessToken;
    const target = `${FileSystem.cacheDirectory}${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const downloaded = await FileSystem.downloadAsync(uri, target, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    localUri = downloaded.uri;
  }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(localUri, { mimeType: 'application/pdf' });
}

export default function App() {
  const [lang, setLang] = useState<Lang>("ru");
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [data, setData] = useState<AppData>(seedData);
  const [ready, setReady] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationTarget, setNotificationTarget] = useState<NotificationTarget | null>(null);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [api, setApi] = useState<ApiClient | null>(null);
  const [serverNotifications, setServerNotifications] = useState<{ id: string; title: string; text: string; kind: "info"; target: NotificationTarget }[]>([]);
  const syncing = useRef(false);
  const lastBootstrapKey = useRef('');
  const t = copy[lang];
  const syncTrigger = data.queue.map((item) => `${item.id}:${item.status}:${item.attempts}:${item.nextAttemptAt ?? ''}`).join('|');

  useEffect(
    () => NetInfo.addEventListener((s) => setOnline(Boolean(s.isConnected))),
    [],
  );
  useEffect(() => {
    void Promise.all([loadData(), loadPreferences(), loadSession()]).then(([savedData, prefs, savedSession]) => {
      setData(savedData);
      const client = new ApiClient(savedSession, async (next) => { await saveSession(next); setSession(next); });
      setApi(client);
      setSession(savedSession);
      setRole(roleFromSession(savedSession, prefs.role));
      setLang(prefs.lang);
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready || !online || !api || !session || syncing.current || data.queue.length === 0) return;
    const sendable = data.queue.filter((item) => ['task.closed', 'task.reviewed'].includes(item.type) && item.payload && item.status !== 'conflict');
    if (sendable.length === 0) return;
    const nextAttempt = Math.min(...sendable.map((item) => item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : 0));
    const delay = Math.max(0, nextAttempt - Date.now());
    const timer = setTimeout(() => {
      syncing.current = true;
      void syncQueue(data, api).then((next) => { setData(next); return saveData(next); }).finally(() => { syncing.current = false; });
    }, delay);
    return () => clearTimeout(timer);
  }, [api, online, ready, session, syncTrigger]);
  useEffect(() => {
    if (!ready || !online || !api || !session) return;
    const key = `${session.user?.id ?? 'session'}:${data.queue.length}`;
    if (lastBootstrapKey.current === key) return;
    lastBootstrapKey.current = key;
    void refreshServerData(data, api, lang)
      .then((next) => { setData(next); return saveData(next); })
      .catch(() => { lastBootstrapKey.current = ''; });
  }, [api, data.queue.length, lang, online, ready, session]);
  useEffect(() => {
    if (ready) void savePreferences({ role, lang });
  }, [lang, ready, role]);
  const updateData = (next: AppData) => {
    setData(next);
    void saveData(next);
  };
  const activeRole = roles.find((r) => r.id === role);
  const visibleProjects =
    role === "customer" || role === "subcontractor"
      ? data.projects.slice(0, 1)
      : data.projects;
  const activeProject = useMemo(
    () => data.projects.find((p) => p.id === projectId),
    [data.projects, projectId],
  );
  const notifications = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const c = lang === "uz" ? { overdue: "Vazifa muddati o'tgan", deadline: "muddat", lowStock: "Kam qoldiq", minimum: "minimum", review: "Tekshiruv kutilmoqda" } : lang === "en" ? { overdue: "Task overdue", deadline: "deadline", lowStock: "Low stock", minimum: "minimum", review: "Awaiting review" } : { overdue: "Просрочена задача", deadline: "срок", lowStock: "Низкий остаток", minimum: "минимум", review: "Ожидает проверки" };
    return [
      ...serverNotifications,
      ...data.tasks.filter((x) => x.status !== "done" && x.due < today).map((x) => ({ id: `task-${x.id}`, title: c.overdue, text: `${x.title} - ${c.deadline} ${x.due}`, kind: "danger" as const, target: { screen: "task", id: x.id } as NotificationTarget })),
    ];
  }, [data, lang, serverNotifications]);

  const openNotifications = async () => {
    if (api && online && session) {
      try {
        const response = await api.request('/api/notifications?unread=true');
        if (response.ok) {
          const payload = await response.json() as { items: { id: string; title: string; body: string; entityType?: string; entityId?: string }[] };
          setServerNotifications(payload.items.map((item) => ({
            id: `server-${item.id}`, title: item.title, text: item.body, kind: 'info' as const,
            target: item.entityType === 'task' ? { screen: 'task' as const, id: item.entityId ?? '' } : item.entityType === 'act' ? { screen: 'act' as const, id: item.entityId ?? '' } : { screen: 'document' as const, id: item.entityId ?? '' },
          })));
        }
      } catch { /* local warnings remain available offline */ }
    }
    setShowNotifications(true);
  };

  useEffect(() => {
    if (!role) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (showNotifications) {
          setShowNotifications(false);
          return true;
        }
        if (projectId) {
          setProjectId(null);
          return true;
        }
        if (tab === "tasks" || tab === "quality" || tab === "supply")
          return false;
        if (tab !== "home") {
          setTab("home");
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [projectId, role, showNotifications, tab]);

  if (!ready) return <SafeAreaView style={s.safe}><View style={s.loading}><Text style={s.brandBig}>StroyControl</Text><Text style={s.muted}>{lang === "uz" ? "Mahalliy ma'lumotlar yuklanmoqda..." : lang === "en" ? "Loading local data..." : "Загрузка локальных данных..."}</Text></View></SafeAreaView>;

  if (!session && api)
    return <LoginScreen lang={lang} api={api} onLogin={(next) => {
      setSession(next);
      setRole(roleFromSession(next, null));
    }} />;

  if (!role) return <SafeAreaView style={s.safe}><View style={s.loading}><Text style={s.h1}>{lang === "uz" ? "Rol tayinlanmagan" : lang === "en" ? "No role assigned" : "Нет назначенной роли"}</Text><Text style={s.muted}>{lang === "uz" ? "Kompaniya administratoriga murojaat qiling." : lang === "en" ? "Contact your company administrator." : "Обратись к администратору компании."}</Text><Pressable style={s.outline} onPress={() => void api?.logout()}><Text style={s.outlineText}>{lang === "uz" ? "Chiqish" : lang === "en" ? "Sign out" : "Выйти"}</Text></Pressable></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <View style={s.header}>
        <View>
          <Text style={s.brand}>StroyControl</Text>
          <Text style={s.roleText}>{activeRole?.[lang]}</Text>
        </View>
        <View style={s.headerRight}>
          <Pressable style={s.bell} onPress={() => void openNotifications()}>
            <Text style={s.bellText}>!</Text>
            {notifications.length > 0 && <Text style={s.badge}>{notifications.length}</Text>}
          </Pressable>
          <Pressable
            style={s.lang}
            onPress={() => setLang(lang === "ru" ? "uz" : lang === "uz" ? "en" : "ru")}
          >
            <Text style={s.langText}>{lang.toUpperCase()}</Text>
          </Pressable>
          <Text style={[s.connection, online ? s.ok : s.warn]}>
            {online ? t.online : t.offline}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        {showNotifications ? <NotificationsScreen lang={lang} items={notifications} close={() => setShowNotifications(false)} open={(item) => {
          if (item.id.startsWith('server-') && api) void api.request(`/api/notifications/${encodeURIComponent(item.id.slice(7))}/read`, { method: 'POST' });
          setQuickAction(null);
          setNotificationTarget(item.target);
          setShowNotifications(false);
          setProjectId(null);
          setTab(tabForNotification(item.target));
        }} /> : <>
        {tab === "home" && (
          <Dashboard
            lang={lang}
            t={t}
            items={visibleProjects}
            role={role}
            taskCount={data.tasks.filter((x) => x.status !== "done").length}
            openProject={(id) => {
              setProjectId(id);
              setTab("objects");
            }}
            openQuick={(action) => {
              setQuickAction(action);
              setProjectId(null);
              if (action === "photo") {
                const report = data.qualityReports.find((x) => x.status === "draft" || x.status === "rejected");
                setNotificationTarget(report ? { screen: "quality", id: report.id } : null);
                setTab("quality");
              } else if (action === "voice") setTab("feed");
              else setTab("supply");
            }}
          />
        )}
        {tab === "objects" &&
          (activeProject ? (
            <ProjectDetails
              item={activeProject}
              t={t}
              back={() => setProjectId(null)}
            />
          ) : (
            <ProjectList t={t} items={visibleProjects} open={setProjectId} />
          ))}
        {tab === "tasks" && (
          <TasksScreen
            t={t}
            lang={lang}
            role={role}
            accessToken={session?.accessToken}
            api={api}
            data={data}
            updateData={updateData}
            initialSelected={notificationTarget?.screen === "task" ? notificationTarget.id : null}
            backHome={() => setTab("home")}
          />
        )}
        {tab === "quality" && (
          <QualityScreen
            lang={lang}
            role={role}
            api={api}
            data={data}
            updateData={updateData}
            initialSelected={notificationTarget?.screen === "quality" ? notificationTarget.id : null}
            backHome={() => setTab("home")}
          />
        )}
        {tab === "feed" && (
          <FeedScreen lang={lang} role={role} api={api} data={data} updateData={updateData} initialSection={notificationTarget?.screen === 'act' ? 'acts' : notificationTarget?.screen === 'document' ? 'docs' : quickAction === "voice" ? "journal" : null} />
        )}
        {tab === "supply" && (
          <SupplyScreen
            lang={lang}
            data={data}
            updateData={updateData}
            initialMaterialId={notificationTarget?.screen === "material" ? notificationTarget.id : null}
            initialSection={quickAction === "violation" ? "safety" : quickAction === "qr" ? "tools" : null}
            autoScanner={quickAction === "qr"}
            backHome={() => setTab("home")}
          />
        )}
        {tab === "profile" && (
          <ProfileScreen
            t={t}
            lang={lang}
            setLang={setLang}
            activeRole={activeRole}
            data={data}
            updateData={updateData}
            logout={async () => { if (!api) return; await api.logout(); setSession(null); setRole(null); }}
          />
        )}
        </>}
      </ScrollView>
      {!showNotifications && <View style={s.bottom}>
        {tabsByRole[role].map((id) => (
          <Pressable
            key={id}
            style={s.nav}
            onPress={() => {
              setQuickAction(null);
              setNotificationTarget(null);
              setTab(id);
              setProjectId(null);
            }}
          >
            <Text style={[s.navIcon, tab === id && s.navActive]}>
              {id === "home"
                ? "⌂"
                : id === "objects"
                  ? "▦"
                  : id === "tasks"
                    ? "✓"
                    : id === "quality"
                      ? "◎"
                      : id === "feed"
                        ? "✉"
                        : id === "supply"
                          ? "▣"
                          : "●"}
            </Text>
            <Text style={[s.navText, tab === id && s.navActive]}>{t[id]}</Text>
          </Pressable>
        ))}
      </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoginScreen({ lang, api, onLogin }: { lang: Lang; api: ApiClient; onLogin: (session: Session) => void }) {
  const c = lang === "uz" ? { missing: "Ma'lumotlarni to'ldiring", missingBody: "Login va kamida 3 belgili parolni kiriting.", failed: "Kirish amalga oshmadi", connection: "Server bilan aloqani tekshiring.", invalidCredentials: "Login yoki parol noto'g'ri.", serverUnavailable: "Avtorizatsiya serveri mavjud emas.", title: "Kompaniyaga kirish", body: "Rol va obyektlarga kirishni administrator tayinlaydi.", username: "Login", password: "Parol", busy: "Kirilmoqda...", login: "Kirish" } : lang === "en" ? { missing: "Complete the fields", missingBody: "Enter a username and a password of at least 3 characters.", failed: "Sign in failed", connection: "Check the connection to the server.", invalidCredentials: "Incorrect username or password.", serverUnavailable: "The authentication server is unavailable.", title: "Company sign in", body: "Your administrator assigns your role and site access.", username: "Username", password: "Password", busy: "Signing in...", login: "Sign in" } : { missing: "Заполни данные", missingBody: "Укажи логин и пароль не короче 3 символов.", failed: "Не удалось войти", connection: "Проверь соединение с сервером.", invalidCredentials: "Неверный логин или пароль.", serverUnavailable: "Сервер авторизации недоступен.", title: "Вход в компанию", body: "Роль и доступ к объектам назначает администратор.", username: "Логин", password: "Пароль", busy: "Входим...", login: "Войти" };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (email.trim().length < 3 || password.length < 3) return Alert.alert(c.missing, c.missingBody);
    setBusy(true);
    try { onLogin(await api.login(email.trim(), password)); }
    catch (error) {
      const code = error instanceof Error ? error.message : '';
      Alert.alert(c.failed, code === 'auth_invalid_credentials' ? c.invalidCredentials : code === 'auth_server_unavailable' ? c.serverUnavailable : c.connection);
    }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={s.safe}>
    <KeyboardAvoidingView style={s.loginWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.brandBig}>StroyControl</Text>
      <Text style={s.h1}>{c.title}</Text>
      <Text style={s.muted}>{c.body}</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="default" placeholder={c.username} style={s.field} />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder={c.password} style={s.field} onSubmitEditing={() => void submit()} />
      <Pressable style={[s.primary, busy && s.disabled]} disabled={busy} onPress={() => void submit()}><Text style={s.primaryText}>{busy ? c.busy : c.login}</Text></Pressable>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function RolePicker({
  lang,
  setLang,
  onPick,
}: {
  lang: Lang;
  setLang: (v: Lang) => void;
  onPick: (v: Role) => void;
}) {
  const t = copy[lang];
  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={s.loginHead}>
        <Text style={s.brandBig}>StroyControl</Text>
        <View style={s.switcher}>
          {(["ru", "uz", "en"] as Lang[]).map((x) => (
            <Pressable
              key={x}
              style={[s.switchBtn, lang === x && s.switchActive]}
              onPress={() => setLang(x)}
            >
              <Text style={lang === x ? s.switchTextActive : s.switchText}>
                {x.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={s.login} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>{t.choose}</Text>
        <Text style={s.muted}>{t.subtitle}</Text>
        {roles.map((r) => (
          <Pressable key={r.id} style={s.roleCard} onPress={() => onPick(r.id)}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {r[lang].slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={s.flex}>
              <Text style={s.cardTitle}>{r[lang]}</Text>
              <Text style={s.muted}>{r.scope[lang]}</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function NotificationsScreen({ lang, items, close, open }: { lang: Lang; items: { id: string; title: string; text: string; kind: "danger" | "warning" | "info"; target: NotificationTarget }[]; close: () => void; open: (item: { id: string; target: NotificationTarget }) => void }) {
  const c = lang === "uz" ? { back: "Orqaga", title: "Ogohlantirishlar", body: "Asl yozuvni ochish uchun ogohlantirishni bosing.", calm: "Hammasi joyida", empty: "Faol ogohlantirishlar yo'q." } : lang === "en" ? { back: "Back", title: "Alerts", body: "Tap an alert to open the original item.", calm: "All clear", empty: "No active alerts." } : { back: "Назад", title: "Предупреждения", body: "Нажми на предупреждение, чтобы открыть исходную запись.", calm: "Все спокойно", empty: "Активных предупреждений нет." };
  return <View><Pressable onPress={close}><Text style={s.link}>‹ {c.back}</Text></Pressable><Text style={s.h1}>{c.title}</Text><Text style={s.muted}>{c.body}</Text>{items.length === 0 && <View style={s.card}><Text style={s.cardTitle}>{c.calm}</Text><Text style={s.muted}>{c.empty}</Text></View>}{items.map((x) => <Pressable key={x.id} onPress={() => open(x)} style={[s.card, x.kind === "danger" ? s.noticeDanger : x.kind === "warning" ? s.noticeWarning : s.noticeInfo]}><View style={s.row}><View style={s.flex}><Text style={s.cardTitle}>{x.title}</Text><Text style={s.muted}>{x.text}</Text></View><Text style={s.chevron}>›</Text></View></Pressable>)}</View>;
}

function Dashboard({
  lang,
  t,
  items,
  role,
  taskCount,
  openProject,
  openQuick,
}: {
  lang: Lang;
  t: UiCopy;
  items: Project[];
  role: Role;
  taskCount: number;
  openProject: (id: string) => void;
  openQuick: (action: QuickAction) => void;
}) {
  const defects = items.reduce((n, p) => n + p.defectsOpen, 0);
  const delayed = items.filter((p) => p.risk !== "low").length;
  const quick = lang === "uz" ? { title: "Tezkor amallar", photo: "Fotohisobot", violation: "Qoidabuzarlik", qr: "QR skaner", voice: "Ovozli jurnal" } : lang === "en" ? { title: "Quick actions", photo: "Photo report", violation: "Violation", qr: "QR scanner", voice: "Voice log" } : { title: "Быстрые действия", photo: "Фотоотчет", violation: "Нарушение", qr: "Сканер QR", voice: "Голосовой журнал" };
  const quickActions: [QuickAction, string, string][] = [];
  return (
    <View>
      <Text style={s.eyebrow}>{t.stage02}</Text>
      <Text style={s.h1}>
        {role === "customer" ? items[0]?.name : t.portfolio}
      </Text>
      <View style={s.metrics}>
        <Metric value={String(items.length)} label={t.objects} />
        <Metric value={String(taskCount)} label={t.openTasks} />
        <Metric value={String(defects)} label={t.defects} />
        <Metric value={String(delayed)} label={t.delayed} bad={delayed > 0} />
      </View>
      {quickActions.length > 0 && <><Text style={s.section}>{quick.title}</Text>
      <View style={s.quickGrid}>
        {quickActions.map(([action, icon, label]) => (
          <Pressable key={action} style={s.quickAction} onPress={() => openQuick(action)}>
            <Text style={s.quickIcon}>{icon}</Text>
            <Text style={s.quickText}>{label}</Text>
          </Pressable>
        ))}
      </View></>}
      <Text style={s.section}>{t.allObjects}</Text>
      {items.map((p) => (
        <ProjectCard
          key={p.id}
          item={p}
          t={t}
          onPress={() => openProject(p.id)}
        />
      ))}
    </View>
  );
}
function ProjectList({
  t,
  items,
  open,
}: {
  t: UiCopy;
  items: Project[];
  open: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((x) => `${x.name} ${x.address}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <View>
      <Text style={s.h1}>{t.objects}</Text>
      <TextInput value={query} onChangeText={setQuery} placeholder={t.searchObject} style={s.search} />
      {filtered.map((p) => (
        <ProjectCard key={p.id} item={p} t={t} onPress={() => open(p.id)} />
      ))}
      {filtered.length === 0 && <Text style={s.muted}>{t.nothingFound}</Text>}
    </View>
  );
}
function ProjectCard({
  item,
  t,
  onPress,
}: {
  item: Project;
  t: UiCopy;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={s.row}>
        <View style={s.flex}>
          <Text style={s.cardTitle}>{item.name}</Text>
          <Text style={s.muted}>{item.address}</Text>
        </View>
        <Text
          style={[
            s.risk,
            item.risk === "high"
              ? s.riskHigh
              : item.risk === "medium"
                ? s.riskMid
                : s.riskLow,
          ]}
        >
          {item.risk === "high"
            ? `+14 ${t.daysShort}`
            : item.risk === "medium"
              ? `+3 ${t.daysShort}`
              : "OK"}
        </Text>
      </View>
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${item.progress}%` }]} />
      </View>
      <View style={s.row}>
        <Text style={s.muted}>
          {t.progress}: {item.progress}%
        </Text>
        <Text style={s.muted}>
          {t.plan}: {item.plan}%
        </Text>
      </View>
    </Pressable>
  );
}
function ProjectDetails({
  item,
  t,
  back,
}: {
  item: Project;
  t: UiCopy;
  back: () => void;
}) {
  return (
    <View>
      <Pressable onPress={back}>
        <Text style={s.link}>‹ {t.objects}</Text>
      </Pressable>
      <Text style={s.h1}>{item.name}</Text>
      <Text style={s.muted}>{item.address}</Text>
      <View style={s.hero}>
        <Text style={s.heroValue}>{item.progress}%</Text>
        <Text style={s.heroLabel}>{t.progress}</Text>
        <View style={s.progressBg}>
          <View style={[s.progressFill, { width: `${item.progress}%` }]} />
        </View>
      </View>
      <View style={s.card}>
        <Line k={t.deadline} v={item.deadline} />
        <Line k={t.forecast} v={item.forecast} bad={item.risk !== "low"} />
        <Line k={t.openTasks} v={String(item.tasksOpen)} />
        <Line k={t.defects} v={String(item.defectsOpen)} />
      </View>
    </View>
  );
}
function DateFields({ value, onChange, label, clearLabel }: { value: string; onChange: (value: string) => void; label: string; clearLabel: string }) {
  const inputRef = useRef<TextInput>(null);
  return <View style={s.dateBlock}>
    <View style={s.row}>
      <Text style={[s.label, s.flex]}>{label}</Text>
      {!!value && <Pressable onPress={() => { onChange(''); inputRef.current?.focus(); }}><Text style={s.link}>{clearLabel}</Text></Pressable>}
    </View>
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={(text) => onChange(formatDateInput(text))}
      placeholder="ДД.ММ.ГГГГ"
      keyboardType="number-pad"
      maxLength={10}
      selectTextOnFocus={false}
      style={s.field}
    />
  </View>;
}

function TasksScreen({
  t,
  lang,
  role,
  accessToken,
  api,
  data,
  updateData,
  backHome,
  initialSelected,
}: {
  t: UiCopy;
  lang: Lang;
  role: Role;
  accessToken?: string;
  api: ApiClient | null;
  data: AppData;
  updateData: (d: AppData) => void;
  backHome: () => void;
  initialSelected: string | null;
}) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createProjectId, setCreateProjectId] = useState("");
  const [createSectionId, setCreateSectionId] = useState("");
  const [createAssigneeId, setCreateAssigneeId] = useState("");
  const [createPriority, setCreatePriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [createDeadline, setCreateDeadline] = useState("");
  const [createChecklist, setCreateChecklist] = useState("");
  const [planningUsers, setPlanningUsers] = useState<PlanningUser[]>([]);
  const [planningSections, setPlanningSections] = useState<PlanningSection[]>([]);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editPriority, setEditPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [editDeadline, setEditDeadline] = useState("");
  const [editChecklist, setEditChecklist] = useState("");
  const canCreate = ['admin', 'director', 'pm'].includes(role);
  const allowed =
    role === "subcontractor" ? data.tasks.slice(0, 1) : data.tasks;
  const items = allowed.filter((x) => (filter === "all" || x.status === filter) && `${x.title} ${x.stage} ${x.assignee}`.toLowerCase().includes(query.trim().toLowerCase()));
  const task = data.tasks.find((x) => x.id === selected);
  const c = lang === "uz"
    ? { assignError: "Texnik nazoratchini tayinlab bo'lmadi", serverError: "Server xatosi", search: "Vazifa, bosqich yoki ijrochi bo'yicha qidirish", empty: "Filtr bo'yicha vazifalar yo'q", newTask: "Vazifa qo'yish", title: "Vazifa nomi", chooseObject: "Obyektni tanlang", chooseSection: "Ish bo'limini tanlang", chooseAssignee: "Ijrochini tanlang", noAssignee: "Tayinlanmagan", deadlineHint: "Muddat", clearDate: "Tozalash", create: "Vazifa yaratish", cancel: "Bekor qilish", created: "Vazifa yaratildi", createError: "Vazifani yaratib bo'lmadi", required: "Nom, obyekt va bo'limni to'ldiring", loading: "Ma'lumotlar yuklanmoqda...", priority: "Ustuvorlik" }
    : lang === "en"
      ? { assignError: "Could not assign inspector", serverError: "Server error", search: "Search by task, stage, or assignee", empty: "No tasks match this filter", newTask: "Create task", title: "Task title", chooseObject: "Choose an object", chooseSection: "Choose a work section", chooseAssignee: "Choose an assignee", noAssignee: "Unassigned", deadlineHint: "Deadline", clearDate: "Clear", create: "Create task", cancel: "Cancel", created: "Task created", createError: "Could not create task", required: "Enter a title, object and section", loading: "Loading data...", priority: "Priority" }
      : { assignError: "Не удалось назначить технадзор", serverError: "Ошибка сервера", search: "Поиск по задаче, этапу или исполнителю", empty: "Задач по фильтру нет", newTask: "Поставить задачу", title: "Название задачи", chooseObject: "Выберите объект", chooseSection: "Выберите раздел работ", chooseAssignee: "Выберите исполнителя", noAssignee: "Не назначен", deadlineHint: "Срок", clearDate: "Очистить", create: "Создать задачу", cancel: "Отмена", created: "Задача создана", createError: "Не удалось создать задачу", required: "Заполните название, объект и раздел", loading: "Загружаем данные...", priority: "Приоритет" };
  const extra = lang === 'uz'
    ? { description: "Tavsif", checklist: "Tekshiruv ro'yxati - har bir band yangi qatordan", edit: "Vazifani tahrirlash", save: "O'zgarishlarni saqlash", saved: "Vazifa yangilandi", saveError: "O'zgarishlarni saqlab bo'lmadi", invalidDate: "Sanani DD.MM.YYYY formatida kiriting" }
    : lang === 'en'
      ? { description: 'Description', checklist: 'Checklist - one item per line', edit: 'Edit task', save: 'Save changes', saved: 'Task updated', saveError: 'Could not save changes', invalidDate: 'Enter a valid date as DD.MM.YYYY' }
      : { description: 'Описание', checklist: 'Чек-лист - каждый пункт с новой строки', edit: 'Редактировать задачу', save: 'Сохранить изменения', saved: 'Задача обновлена', saveError: 'Не удалось сохранить изменения', invalidDate: 'Укажи корректную дату в формате ДД.ММ.ГГГГ' };

  const loadPlanning = async (project: string) => {
    if (!api || !project) return;
    try {
      const [objectResponse, usersResponse] = await Promise.all([
        api.request(`/api/objects/${encodeURIComponent(project)}`),
        api.request('/api/planning/users'),
      ]);
      if (!objectResponse.ok || !usersResponse.ok) throw new Error(`HTTP ${objectResponse.status}/${usersResponse.status}`);
      const object = await objectResponse.json() as { stages: { name: string; sections: { id: string; name: string }[] }[] };
      const sections = object.stages.flatMap((stage) => stage.sections.map((section) => ({ ...section, stage: stage.name })));
      setPlanningSections(sections);
      setCreateSectionId(sections[0]?.id ?? '');
      setPlanningUsers((await usersResponse.json() as PlanningUser[]));
    } catch (error) {
      Alert.alert(c.createError, error instanceof Error ? error.message : c.serverError);
    }
  };

  const openCreate = () => {
    const firstProject = data.projects[0]?.id ?? '';
    setCreateProjectId(firstProject);
    setShowCreate(true);
    void loadPlanning(firstProject);
  };

  const submitTask = async () => {
    if (!api || creating) return;
    if (!createTitle.trim() || !createProjectId || !createSectionId) return Alert.alert(c.createError, c.required);
    const plannedEnd = createDeadline ? dateInputToIso(createDeadline) : undefined;
    if (createDeadline && !plannedEnd) return Alert.alert(c.createError, extra.invalidDate);
    setCreating(true);
    try {
      const response = await api.request(`/api/objects/sections/${encodeURIComponent(createSectionId)}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          assigneeId: createAssigneeId || null,
          priority: createPriority,
          plannedEnd,
          dependsOn: [],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json() as { id: string };
      for (const label of createChecklist.split('\n').map((item) => item.trim()).filter(Boolean)) {
        const checklistResponse = await api.request(`/api/tasks/${encodeURIComponent(created.id)}/checklist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
        if (!checklistResponse.ok) throw new Error(`Checklist HTTP ${checklistResponse.status}`);
      }
      updateData(await refreshServerData(data, api, lang));
      setCreateTitle(''); setCreateAssigneeId(''); setCreateDeadline(''); setCreateChecklist(''); setCreatePriority('normal'); setShowCreate(false);
      Alert.alert(c.created);
    } catch (error) {
      Alert.alert(c.createError, error instanceof Error ? error.message : c.serverError);
    } finally { setCreating(false); }
  };

  const beginEdit = () => {
    if (!task) return;
    setEditTitle(task.title); setEditDescription(task.description ?? ''); setEditAssigneeId(task.assigneeId ?? '');
    setEditPriority(task.priority === 'medium' ? 'normal' : task.priority); setEditDeadline(isoToDateInput(task.due)); setEditChecklist(''); setEditing(true);
    if (!planningUsers.length && api) void api.request('/api/planning/users').then(async (response) => { if (response.ok) setPlanningUsers(await response.json() as PlanningUser[]); });
  };

  const saveEdit = async () => {
    if (!task || !api || savingEdit || !editTitle.trim()) return;
    const plannedEnd = editDeadline ? dateInputToIso(editDeadline) : null;
    if (editDeadline && !plannedEnd) return Alert.alert(extra.saveError, extra.invalidDate);
    setSavingEdit(true);
    try {
      const response = await api.request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: editTitle.trim(), description: editDescription.trim(), assigneeId: editAssigneeId || null, priority: editPriority, plannedEnd }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      for (const label of editChecklist.split('\n').map((item) => item.trim()).filter(Boolean)) {
        const checklistResponse = await api.request(`/api/tasks/${encodeURIComponent(task.id)}/checklist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label }) });
        if (!checklistResponse.ok) throw new Error(`Checklist HTTP ${checklistResponse.status}`);
      }
      updateData(await refreshServerData(data, api, lang)); setEditing(false); Alert.alert(extra.saved);
    } catch (error) { Alert.alert(extra.saveError, error instanceof Error ? error.message : c.serverError); }
    finally { setSavingEdit(false); }
  };

  const toggleChecklist = async (itemId: string, done: boolean) => {
    if (!task || !api || task.status === 'review' || task.status === 'done') return;
    try {
      const response = await api.request(`/api/tasks/${encodeURIComponent(task.id)}/checklist/${encodeURIComponent(itemId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isDone: done }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateData({ ...data, tasks: data.tasks.map((value) => value.id === task.id ? { ...value, checklist: value.checklist.map((item) => item.id === itemId ? { ...item, done } : item) } : value) });
    } catch (error) { Alert.alert(c.serverError, error instanceof Error ? error.message : c.serverError); }
  };
  const assignReviewer = async (reviewerId: string) => {
    if (!task || !api || assigningReviewer) return;
    setAssigningReviewer(true);
    try {
      const response = await api.request(`/api/tasks/${encodeURIComponent(task.id)}/reviewer`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reviewerId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const reviewer = data.reviewers.find((item) => item.id === reviewerId);
      updateData({ ...data, tasks: data.tasks.map((item) => item.id === task.id ? { ...item, reviewerId, reviewerName: reviewer?.name } : item) });
    } catch (error) {
      Alert.alert(c.assignError, error instanceof Error ? error.message : c.serverError);
    } finally { setAssigningReviewer(false); }
  };
  useEffect(() => { if (initialSelected) setSelected(initialSelected); }, [initialSelected]);
  useEffect(() => { setDraftPhotos([]); }, [selected]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (editing) setEditing(false);
        else if (showCreate) setShowCreate(false);
        else if (selected) setSelected(null);
        else backHome();
        return true;
      },
    );
    return () => subscription.remove();
  }, [editing, selected, showCreate]);
  const labels: Record<TaskStatus | "all", string> =
    lang === "uz"
      ? {
          all: "Barchasi",
          open: "Ochiq",
          in_progress: "Jarayonda",
          review: "Tekshiruvda",
          done: "Tayyor",
        }
      : lang === "en"
        ? {
            all: "All",
            open: "Open",
            in_progress: "In progress",
            review: "In review",
            done: "Done",
          }
        : {
          all: "Все",
          open: "Открыты",
          in_progress: "В работе",
          review: "На проверке",
          done: "Готово",
        };
  const capture = async () => {
    if (!task) return;
    if (draftPhotos.length >= 10) return Alert.alert(t.attachedPhotos, t.photoLimit);
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (!camera.granted)
      return Alert.alert(t.permissionsNeeded, t.permissionsBody);
    const photo = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (photo.canceled) return;
    const asset = photo.assets[0];
    if (!asset) return;
    setDraftPhotos((current) => [...current, asset.uri].slice(0, 10));
  };
  const submitPhotos = async () => {
    if (!task) return;
    if (!draftPhotos.length) return Alert.alert(t.attachedPhotos, t.photoRequired);
    const geo = await Location.requestForegroundPermissionsAsync();
    if (!geo.granted) return Alert.alert(t.permissionsNeeded, t.permissionsBody);
    const point = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    updateData(
      closeTask(
        data,
        task.id,
        draftPhotos,
        point.coords.latitude,
        point.coords.longitude,
      ),
    );
    setDraftPhotos([]);
    Alert.alert(t.sentForReview, t.savedOffline);
  };
  if (task)
    return (
      <View>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={s.link}>‹ {t.tasks}</Text>
        </Pressable>
        <Text style={s.h1}>{task.title}</Text>
        {canCreate && !editing && <Pressable style={s.outline} onPress={beginEdit}><Text style={s.outlineText}>{extra.edit}</Text></Pressable>}
        {canCreate && editing && <View style={s.card}>
          <Pressable disabled={savingEdit} onPress={() => setEditing(false)}><Text style={s.link}>‹ {c.cancel}</Text></Pressable>
          <Text style={s.cardTitle}>{extra.edit}</Text>
          <TextInput value={editTitle} onChangeText={setEditTitle} placeholder={c.title} style={s.input} />
          <TextInput value={editDescription} onChangeText={setEditDescription} placeholder={extra.description} multiline style={s.input} />
          <Text style={s.label}>{c.chooseAssignee}</Text>
          <Pressable style={!editAssigneeId ? s.primary : s.outlineInline} onPress={() => setEditAssigneeId('')}><Text style={!editAssigneeId ? s.primaryText : s.outlineText}>{c.noAssignee}</Text></Pressable>
          {planningUsers.map((user) => <Pressable key={user.id} style={user.id === editAssigneeId ? s.primary : s.outlineInline} onPress={() => setEditAssigneeId(user.id)}><Text style={user.id === editAssigneeId ? s.primaryText : s.outlineText}>{user.fullName}</Text></Pressable>)}
          <Text style={s.label}>{c.priority}</Text>
          <View style={s.actionRow}>{(['low', 'normal', 'high'] as const).map((priority) => <Pressable key={priority} style={[priority === editPriority ? s.primary : s.outlineInline, s.action]} onPress={() => setEditPriority(priority)}><Text style={priority === editPriority ? s.primaryText : s.outlineText}>{priority === 'low' ? t.low : priority === 'high' ? t.high : t.medium}</Text></Pressable>)}</View>
          <DateFields value={editDeadline} onChange={setEditDeadline} label={c.deadlineHint} clearLabel={c.clearDate} />
          <TextInput value={editChecklist} onChangeText={setEditChecklist} placeholder={extra.checklist} multiline style={s.input} />
          <Pressable disabled={savingEdit} style={s.primary} onPress={() => void saveEdit()}><Text style={s.primaryText}>{savingEdit ? c.loading : extra.save}</Text></Pressable>
          <Pressable disabled={savingEdit} style={s.outline} onPress={() => setEditing(false)}><Text style={s.outlineText}>{c.cancel}</Text></Pressable>
        </View>}
        <View style={s.card}>
          <Line
            k={t.object}
            v={data.projects.find((p) => p.id === task.projectId)?.name ?? "-"}
          />
          <Line k={t.stage} v={task.stage} />
          {!!task.description && <Line k={extra.description} v={task.description} />}
          <Line k={t.responsible} v={task.assignee} />
          <Line k={t.deadline} v={task.due} />
          <Line
            k={t.priority}
            v={
              task.priority === "high"
                ? t.high
                : task.priority === "medium"
                  ? t.medium
                  : t.low
            }
            bad={task.priority === "high"}
          />
          <Line k={t.status} v={labels[task.status]} />
        </View>
        <Text style={s.section}>{t.checklist}</Text>
        {task.checklist.map((x) => (
          <Pressable
            key={x.id}
            style={s.check}
            disabled={task.status === 'review' || task.status === 'done' || !['foreman', 'subcontractor', 'pm', 'admin', 'director'].includes(role)}
            onPress={() => void toggleChecklist(x.id, !x.done)}
          >
            <Text style={[s.checkBox, x.done && s.checkDone]}>
              {x.done ? "✓" : ""}
            </Text>
            <Text style={[s.flex, x.done && s.strike]}>{x.text}</Text>
          </Pressable>
        ))}
        {(task.photoUris?.length || task.photoUri) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t.attachedPhotos}</Text>
            {(task.photoUris?.length ? task.photoUris : [task.photoUri!]).map((uri, index) => <PhotoViewer key={`${uri}:${index}`} uri={uri} compact headers={accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined} />)}
            <GeoPoint lang={lang} latitude={task.latitude} longitude={task.longitude} />
          </View>
        )}
        {['admin', 'director', 'pm'].includes(role) && task.status === 'review' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t.assignInspector}</Text>
            <Text style={s.muted}>{task.reviewerName ? `${t.assignedNow}: ${task.reviewerName}` : t.reviewerMissing}</Text>
            {data.reviewers.filter((reviewer) => reviewer.objectIds.length === 0 || reviewer.objectIds.includes(task.projectId)).map((reviewer) => (
              <Pressable key={reviewer.id} disabled={assigningReviewer} style={reviewer.id === task.reviewerId ? s.primary : s.outline} onPress={() => void assignReviewer(reviewer.id)}>
                <Text style={reviewer.id === task.reviewerId ? s.primaryText : s.outlineText}>{reviewer.name}</Text>
              </Pressable>
            ))}
            {data.reviewers.length === 0 && <Text style={s.muted}>{t.noInspectors}</Text>}
          </View>
        )}
        {['foreman', 'subcontractor', 'pm', 'admin', 'director'].includes(role) && task.status !== "review" && task.status !== "done" && (
          <View style={s.card}>
            {!!draftPhotos.length && <Text style={s.cardTitle}>{t.attachedPhotos}: {draftPhotos.length}/10</Text>}
            {draftPhotos.map((uri, index) => <View key={`${uri}:${index}`}><PhotoViewer uri={uri} compact /><Pressable style={s.outlineInline} onPress={() => setDraftPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}><Text style={s.outlineText}>{t.removePhoto}</Text></Pressable></View>)}
            <Pressable style={s.outline} onPress={capture}><Text style={s.outlineText}>{t.closeWithPhoto}</Text></Pressable>
            {!!draftPhotos.length && <Pressable style={s.primary} onPress={submitPhotos}><Text style={s.primaryText}>{t.submitWithPhotos}</Text></Pressable>}
          </View>
        )}
        {role === "inspector" && task.status === "review" && (
          <View style={s.card}>
            <Text style={s.cardTitle}>{t.inspectorDecision}</Text>
            <TextInput value={reviewNote} onChangeText={setReviewNote} placeholder={t.reviewComment} multiline style={s.input} />
            <View style={s.actionRow}>
              <Pressable style={[s.primary, s.action]} onPress={() => { updateData(reviewTask(data, task.id, 'accepted', reviewNote, undefined, lang)); setReviewNote(''); }}><Text style={s.primaryText}>{t.accept}</Text></Pressable>
              <Pressable style={[s.outlineInline, s.action]} onPress={() => {
                const next = reviewTask(data, task.id, 'rejected', reviewNote, undefined, lang);
                if (next === data) return Alert.alert(t.reviewCommentRequired, t.rejectionReason);
                updateData(next); setReviewNote('');
              }}><Text style={s.outlineText}>{t.reject}</Text></Pressable>
            </View>
          </View>
        )}
        {task.reviewNote && <View style={s.card}><Text style={s.label}>{t.reviewResult}</Text><Text>{task.reviewNote}</Text></View>}
        <Text style={s.queue}>
          {t.syncQueue}: {data.queue.length}
        </Text>
      </View>
    );
  return (
    <View>
      <Text style={s.eyebrow}>{t.stage02}</Text>
      <Text style={s.h1}>{t.myTasks}</Text>
      {canCreate && !showCreate && <Pressable style={s.primary} onPress={openCreate}><Text style={s.primaryText}>+ {c.newTask}</Text></Pressable>}
      {canCreate && showCreate && <View style={s.card}>
        <Pressable disabled={creating} onPress={() => setShowCreate(false)}><Text style={s.link}>‹ {c.cancel}</Text></Pressable>
        <Text style={s.cardTitle}>{c.newTask}</Text>
        <TextInput value={createTitle} onChangeText={setCreateTitle} placeholder={c.title} style={s.input} />
        <Text style={s.label}>{c.chooseObject}</Text>
        {data.projects.map((project) => <Pressable key={project.id} style={project.id === createProjectId ? s.primary : s.outlineInline} onPress={() => { setCreateProjectId(project.id); setCreateSectionId(''); void loadPlanning(project.id); }}><Text style={project.id === createProjectId ? s.primaryText : s.outlineText}>{project.name}</Text></Pressable>)}
        <Text style={s.label}>{c.chooseSection}</Text>
        {planningSections.length === 0 && <Text style={s.muted}>{c.loading}</Text>}
        {planningSections.map((section) => <Pressable key={section.id} style={section.id === createSectionId ? s.primary : s.outlineInline} onPress={() => setCreateSectionId(section.id)}><Text style={section.id === createSectionId ? s.primaryText : s.outlineText}>{section.stage} - {section.name}</Text></Pressable>)}
        <Text style={s.label}>{c.chooseAssignee}</Text>
        <Pressable style={!createAssigneeId ? s.primary : s.outlineInline} onPress={() => setCreateAssigneeId('')}><Text style={!createAssigneeId ? s.primaryText : s.outlineText}>{c.noAssignee}</Text></Pressable>
        {planningUsers.map((user) => <Pressable key={user.id} style={user.id === createAssigneeId ? s.primary : s.outlineInline} onPress={() => setCreateAssigneeId(user.id)}><Text style={user.id === createAssigneeId ? s.primaryText : s.outlineText}>{user.fullName}</Text></Pressable>)}
        <Text style={s.label}>{c.priority}</Text>
        <View style={s.actionRow}>{(['low', 'normal', 'high'] as const).map((priority) => <Pressable key={priority} style={[priority === createPriority ? s.primary : s.outlineInline, s.action]} onPress={() => setCreatePriority(priority)}><Text style={priority === createPriority ? s.primaryText : s.outlineText}>{priority === 'low' ? t.low : priority === 'high' ? t.high : t.medium}</Text></Pressable>)}</View>
        <DateFields value={createDeadline} onChange={setCreateDeadline} label={c.deadlineHint} clearLabel={c.clearDate} />
        <TextInput value={createChecklist} onChangeText={setCreateChecklist} placeholder={extra.checklist} multiline style={s.input} />
        <Pressable disabled={creating} style={s.primary} onPress={() => void submitTask()}><Text style={s.primaryText}>{creating ? c.loading : c.create}</Text></Pressable>
        <Pressable disabled={creating} style={s.outline} onPress={() => setShowCreate(false)}><Text style={s.outlineText}>{c.cancel}</Text></Pressable>
      </View>}
      <TextInput value={query} onChangeText={setQuery} placeholder={c.search} style={s.search} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filters}
      >
        {(["all", "open", "in_progress", "review", "done"] as const).map(
          (x) => (
            <Pressable
              key={x}
              style={[s.filter, filter === x && s.filterActive]}
              onPress={() => setFilter(x)}
            >
              <Text style={filter === x ? s.filterTextActive : s.filterText}>
                {labels[x]}
              </Text>
            </Pressable>
          ),
        )}
      </ScrollView>
      {items.map((x) => (
        <Pressable style={s.card} key={x.id} onPress={() => setSelected(x.id)}>
          <View style={s.row}>
            <Text style={[s.priority, x.priority === "high" && s.priorityHigh]}>
              {x.priority === "high" ? t.high : x.priority === "medium" ? t.medium : t.low}
            </Text>
            <Text style={s.status}>{labels[x.status]}</Text>
          </View>
          <Text style={s.cardTitle}>{x.title}</Text>
          <Text style={s.muted}>
            {projects.find((p) => p.id === x.projectId)?.name} - {x.stage}
          </Text>
          <View style={s.row}>
            <Text style={s.muted}>{x.assignee}</Text>
            <Text style={s.muted}>{x.due}</Text>
          </View>
        </Pressable>
      ))}
      {items.length === 0 && <Text style={s.muted}>{c.empty}</Text>}
    </View>
  );
}

function QualityScreen({
  lang,
  role,
  api,
  data,
  updateData,
  backHome,
  initialSelected,
}: {
  lang: Lang;
  role: Role;
  api: ApiClient | null;
  data: AppData;
  updateData: (d: AppData) => void;
  backHome: () => void;
  initialSelected: string | null;
}) {
  const c = lang === "ru" ? {
    draft: "Черновик", review: "На проверке", accepted: "Принято", rejected: "Отклонено",
    cameraTitle: "Нужна камера", cameraBody: "Разреши доступ к камере.", quality: "Контроль качества",
    object: "Объект", type: "Тип", hidden: "Скрытые работы", photoReport: "Фотоотчет", status: "Статус",
    shotDate: "Дата съемки", angles: "Обязательные ракурсы", retake: "Переснять", take: "Снять",
    sendInspector: "Отправить технадзору", takeAll: "Сначала сними все ракурсы", accept: "Принять", reject: "Отклонить",
    timeline: "Таймлайн точки", eyebrow: "APK 0.4 - контроль качества", title: "Фото и технадзор",
    photoReports: "Фотоотчеты", onReview: "На проверке", defects: "Дефекты", anglesCount: "Ракурсы",
    defectList: "Дефект-лист до/после", before: "ДО", after: "ПОСЛЕ", takePhoto: "снять фото", defectOpen: "Открыт", defectClosed: "Закрыт",
  } : lang === "en" ? {
    draft: "Draft", review: "In review", accepted: "Accepted", rejected: "Rejected",
    cameraTitle: "Camera required", cameraBody: "Allow camera access.", quality: "Quality control",
    object: "Site", type: "Type", hidden: "Hidden works", photoReport: "Photo report", status: "Status",
    shotDate: "Date captured", angles: "Required angles", retake: "Retake", take: "Take photo",
    sendInspector: "Send to inspector", takeAll: "Capture all required angles first", accept: "Accept", reject: "Reject",
    timeline: "Point timeline", eyebrow: "StroyControl 1.0 - quality control", title: "Photos and inspection",
    photoReports: "Photo reports", onReview: "In review", defects: "Defects", anglesCount: "Angles",
    defectList: "Defects before/after", before: "BEFORE", after: "AFTER", takePhoto: "take photo", defectOpen: "Open", defectClosed: "Closed",
  } : {
    draft: "Qoralama", review: "Tekshiruvda", accepted: "Qabul qilindi", rejected: "Rad etildi",
    cameraTitle: "Kamera kerak", cameraBody: "Kameraga kirishga ruxsat bering.", quality: "Sifat nazorati",
    object: "Obyekt", type: "Turi", hidden: "Yashirin ishlar", photoReport: "Fotohisobot", status: "Holat",
    shotDate: "Suratga olish sanasi", angles: "Majburiy rakurslar", retake: "Qayta olish", take: "Suratga olish",
    sendInspector: "Texnik nazoratchiga yuborish", takeAll: "Avval barcha rakurslarni oling", accept: "Qabul qilish", reject: "Rad etish",
    timeline: "Nuqta tarixi", eyebrow: "APK 0.4 - sifat nazorati", title: "Foto va texnik nazorat",
    photoReports: "Fotohisobotlar", onReview: "Tekshiruvda", defects: "Nuqsonlar", anglesCount: "Rakurslar",
    defectList: "Nuqsonlar oldin/keyin", before: "OLDIN", after: "KEYIN", takePhoto: "suratga olish", defectOpen: "Ochiq", defectClosed: "Yopilgan",
  };
  const [selected, setSelected] = useState<string | null>(null);
  const report = data.qualityReports.find((x) => x.id === selected);
  useEffect(() => { if (initialSelected) setSelected(initialSelected); }, [initialSelected]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (selected) setSelected(null);
        else backHome();
        return true;
      },
    );
    return () => subscription.remove();
  }, [selected]);
  const status = { draft: c.draft, review: c.review, accepted: c.accepted, rejected: c.rejected } as const;
  const takePhoto = async (angle: string) => {
    if (!report) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(c.cameraTitle, c.cameraBody);
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset) updateData(addQualityPhoto(data, report.id, angle, asset.uri));
  };
  const takeDefectPhoto = async (
    defectId: string,
    side: "before" | "after",
  ) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(c.cameraTitle, c.cameraBody);
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset) updateData(addDefectPhoto(data, defectId, side, asset.uri));
  };
  const submitReport = async () => {
    if (!report) return;
    const local = submitQualityReport(data, report.id);
    if (local === data) return;
    updateData(local);
    const user = api?.getSession()?.user;
    if (!api || !user) return;
    try {
      const uploadedPhotos: { angle: string; uri: string }[] = [];
      for (const photo of report.photos) {
        if (!photo.uri.startsWith('file://') && !photo.uri.startsWith('content://')) { uploadedPhotos.push(photo); continue; }
        const source = await fetch(photo.uri);
        if (!source.ok) throw new Error('photo_read_failed');
        const upload = await api.request('/api/uploads', { method: 'POST', headers: { 'content-type': 'image/jpeg', 'idempotency-key': `quality:${report.id}:${photo.angle}`, 'x-file-name': `quality-${report.id}-${uploadedPhotos.length + 1}.jpg` }, body: await source.blob() });
        if (!upload.ok) throw new Error(`Upload HTTP ${upload.status}`);
        const file = await upload.json() as { url: string };
        uploadedPhotos.push({ angle: photo.angle, uri: file.url });
      }
      const response = await api.request(`/api/objects/${encodeURIComponent(report.projectId)}/photo-reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ authorId: user.id, taskId: report.taskId || undefined, shootingPoint: report.point, kind: report.kind === 'hidden' ? 'hidden_works' : 'progress', fileUrl: uploadedPhotos[0]?.uri, requiredAngles: report.requiredAngles, photos: uploadedPhotos, status: 'review' }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json() as { id: string; createdAt: string };
      updateData({ ...local, qualityReports: local.qualityReports.map((item) => item.id === report.id ? { ...item, id: created.id, photos: uploadedPhotos, status: 'review', createdAt: created.createdAt } : item), queue: local.queue.filter((item) => !(item.type === 'quality.updated' && item.entityId === report.id)) });
      setSelected(created.id);
    } catch { /* offline report remains queued */ }
  };
  const reviewReport = async (accepted: boolean) => {
    if (!report) return;
    const local = reviewQualityReport(data, report.id, accepted, undefined, lang);
    updateData(local);
    const user = api?.getSession()?.user;
    if (!api || !user) return;
    try {
      const response = await api.request(`/api/photo-reports/${encodeURIComponent(report.id)}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: accepted ? 'accepted' : 'rejected', note: '', inspectorSignature: user.fullName || user.id }) });
      if (!response.ok) return;
      updateData({ ...local, queue: local.queue.filter((item) => !(item.type === 'quality.reviewed' && item.entityId === report.id)) });
    } catch { /* offline decision remains queued */ }
  };
  if (report) {
    const complete = report.requiredAngles.every((a) =>
      report.photos.some((p) => p.angle === a),
    );
    return (
      <View>
        <Pressable onPress={() => setSelected(null)}>
          <Text style={s.link}>‹ {c.quality}</Text>
        </Pressable>
        <Text style={s.h1}>{report.point}</Text>
        <View style={s.card}>
          <Line
            k={c.object}
            v={projects.find((p) => p.id === report.projectId)?.name ?? "-"}
          />
          <Line
            k={c.type}
            v={report.kind === "hidden" ? c.hidden : c.photoReport}
          />
          <Line k={c.status} v={status[report.status]} />
          <Line
            k={c.shotDate}
            v={formatDate(report.createdAt, lang)}
          />
        </View>
        <Text style={s.section}>{c.angles}</Text>
        {report.requiredAngles.map((angle) => {
          const photo = report.photos.find((p) => p.angle === angle);
          return (
            <View key={angle} style={s.card}>
              {photo && <PhotoViewer uri={photo.uri} />}
              <View style={s.row}>
                <Text style={s.cardTitle}>
                  {photo ? "✓ " : "○ "}
                  {angle}
                </Text>
                {report.status === "draft" || report.status === "rejected" ? (
                  <Pressable onPress={() => takePhoto(angle)}>
                    <Text style={s.link}>{photo ? c.retake : c.take}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
        {(report.status === "draft" || report.status === "rejected") && (
          <Pressable
            style={[s.primary, !complete && s.disabled]}
            disabled={!complete}
            onPress={() => void submitReport()}
          >
            <Text style={s.primaryText}>
              {complete ? c.sendInspector : c.takeAll}
            </Text>
          </Pressable>
        )}
        {role === "inspector" && report.status === "review" && (
          <View style={s.actionRow}>
            <Pressable
              style={[s.primary, s.action]}
              onPress={() =>
                void reviewReport(true)
              }
            >
              <Text style={s.primaryText}>{c.accept}</Text>
            </Pressable>
            <Pressable
              style={[s.danger, s.action]}
              onPress={() =>
                void reviewReport(false)
              }
            >
              <Text style={s.dangerText}>{c.reject}</Text>
            </Pressable>
          </View>
        )}
        {report.inspectorNote && (
          <Text style={s.note}>
            {report.inspectorNote}
            {report.inspectorName
              ? `\n${report.inspectorName} - ${formatDateTime(report.reviewedAt!, lang)}`
              : ""}
          </Text>
        )}
        <Text style={s.section}>{c.timeline}</Text>
        {data.qualityReports
          .filter((x) => x.point === report.point)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((x) => (
            <Text key={x.id} style={s.timeline}>
              {formatDate(x.createdAt, lang)} -{" "}
              {status[x.status]}
            </Text>
          ))}
      </View>
    );
  }
  return (
    <View>
      <Text style={s.eyebrow}>{c.eyebrow}</Text>
      <Text style={s.h1}>{c.title}</Text>
      <View style={s.metrics}>
        <Metric value={String(data.qualityReports.length)} label={c.photoReports} />
        <Metric
          value={String(
            data.qualityReports.filter((x) => x.kind === "hidden").length,
          )}
          label={c.hidden}
        />
        <Metric
          value={String(
            data.qualityReports.filter((x) => x.status === "review").length,
          )}
          label={c.onReview}
        />
        <Metric
          value={String(
            data.defects.filter((x) => x.status !== "closed").length,
          )}
          label={c.defects}
          bad
        />
      </View>
      {data.qualityReports.map((x) => (
        <Pressable key={x.id} style={s.card} onPress={() => setSelected(x.id)}>
          <View style={s.row}>
            <Text style={s.priority}>
              {(x.kind === "hidden" ? c.hidden : c.photoReport).toUpperCase()}
            </Text>
            <Text style={s.status}>{status[x.status]}</Text>
          </View>
          <Text style={s.cardTitle}>{x.point}</Text>
          <Text style={s.muted}>
            {projects.find((p) => p.id === x.projectId)?.name}
          </Text>
          <Text style={s.muted}>
            {c.anglesCount}: {x.photos.length}/{x.requiredAngles.length}
          </Text>
        </Pressable>
      ))}
      <Text style={s.section}>{c.defectList}</Text>
      {data.defects.map((x) => (
        <View key={x.id} style={s.card}>
          <Text style={s.cardTitle}>{x.title}</Text>
          <Text style={s.muted}>
            {projects.find((p) => p.id === x.projectId)?.name} - {x.status === "closed" ? c.defectClosed : c.defectOpen}
          </Text>
          <View style={s.beforeAfter}>
            <Pressable onPress={() => takeDefectPhoto(x.id, "before")}>
              <Text style={s.link}>
                {c.before}: {x.beforeUri ? c.retake.toLowerCase() : c.takePhoto}
              </Text>
            </Pressable>
            <Pressable onPress={() => takeDefectPhoto(x.id, "after")}>
              <Text style={s.link}>
                {c.after}: {x.afterUri ? c.retake.toLowerCase() : c.takePhoto}
              </Text>
            </Pressable>
          </View>
          {x.beforeUri && (
            <PhotoViewer uri={x.beforeUri} compact />
          )}
          {x.afterUri && (
            <PhotoViewer uri={x.afterUri} compact />
          )}
        </View>
      ))}
    </View>
  );
}

function FeedScreen({
  lang,
  role,
  api,
  data,
  updateData,
  initialSection,
}: {
  lang: Lang;
  role: Role;
  api: ApiClient | null;
  data: AppData;
  updateData: (d: AppData) => void;
  initialSection: "journal" | "docs" | "acts" | null;
}) {
  const c = lang === "ru" ? {
    file: "Файл", micTitle: "Нужен микрофон", micBody: "Разреши запись голоса для журнала работ.",
    eyebrow: "APK 0.5 - коммуникации", title: "Лента объекта", search: "Поиск в текущем разделе",
    threadReply: "Ответ в треде на", message: "Сообщение или @упоминание", addFile: "+ файл", send: "Отправить",
    reply: "Ответить", shiftDone: "Что сделано за смену", stopRecord: "■ Завершить и сохранить",
    voiceRecord: "● Голосовая запись RU/UZ/EN", voiceSaved: "Голосовая запись сохранена",
    uploadVersion: "+ Загрузить новую версию", uploadFailed: "Не удалось загрузить документ", serverError: "Ошибка сервера",
    openPdf: "Открыть PDF", error: "Ошибка", approve: "Согласовать", reject: "Отклонить",
    commentRequired: "Нужен комментарий", rejectionReason: "Укажи причину отклонения документа.", rejectionComment: "Комментарий при отклонении",
  } : lang === "en" ? {
    file: "File", micTitle: "Microphone required", micBody: "Allow audio recording for the work log.",
    eyebrow: "StroyControl 1.0 - communications", title: "Site feed", search: "Search this section",
    threadReply: "Replying in thread to", message: "Message or @mention", addFile: "+ file", send: "Send",
    reply: "Reply", shiftDone: "Work completed during the shift", stopRecord: "■ Stop and save",
    voiceRecord: "● Voice recording RU/UZ/EN", voiceSaved: "Voice recording saved",
    uploadVersion: "+ Upload new version", uploadFailed: "Could not upload document", serverError: "Server error",
    openPdf: "Open PDF", error: "Error", approve: "Approve", reject: "Reject",
    commentRequired: "Comment required", rejectionReason: "Enter the reason for rejecting the document.", rejectionComment: "Rejection comment",
  } : {
    file: "Fayl", micTitle: "Mikrofon kerak", micBody: "Ish jurnaliga ovoz yozish uchun ruxsat bering.",
    eyebrow: "APK 0.5 - aloqa", title: "Obyekt lentasi", search: "Joriy bo'limda qidirish",
    threadReply: "Javob berilayotgan xabar", message: "Xabar yoki @eslatma", addFile: "+ fayl", send: "Yuborish",
    reply: "Javob berish", shiftDone: "Smenada nima qilindi", stopRecord: "■ Tugatish va saqlash",
    voiceRecord: "● RU/UZ/EN ovozli yozuv", voiceSaved: "Ovozli yozuv saqlandi",
    uploadVersion: "+ Yangi versiyani yuklash", uploadFailed: "Hujjatni yuklab bo'lmadi", serverError: "Server xatosi",
    openPdf: "PDF ochish", error: "Xato", approve: "Tasdiqlash", reject: "Rad etish",
    commentRequired: "Izoh kerak", rejectionReason: "Hujjatni rad etish sababini kiriting.", rejectionComment: "Rad etish izohi",
  };
  const [section, setSection] = useState<"feed" | "journal" | "docs" | "acts">("docs");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [documentNote, setDocumentNote] = useState("");
  const [documentProjectId, setDocumentProjectId] = useState(data.projects[0]?.id ?? "");
  const [replyTo, setReplyTo] = useState<string | undefined>();
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  useEffect(() => { if (initialSection) setSection(initialSection); }, [initialSection]);
  const send = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    const local = addMessage(data, body, undefined, replyTo, undefined, lang);
    updateData(local);
    setText("");
    setReplyTo(undefined);
    const pending = local.messages[0];
    const user = api?.getSession()?.user;
    if (!api || !user || !pending) return;
    try {
      const response = await api.request(`/api/objects/${encodeURIComponent(pending.projectId)}/feed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorId: user.id, body, mentionedUserIds: [], ...(replyTo ? { parentEventId: replyTo } : {}) }),
      });
      if (!response.ok) return;
      const created = await response.json() as { id: string; objectId: string; body?: string | null; createdAt: string };
      updateData({
        ...local,
        messages: local.messages.map((item) => item.id === pending.id ? { ...item, id: created.id, projectId: created.objectId, text: created.body ?? body, createdAt: created.createdAt } : item),
        queue: local.queue.filter((item) => !(item.type === 'message.created' && item.entityId === pending.id)),
      });
    } catch { /* offline copy remains in the durable local queue */ }
  };
  const attach = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (asset)
      updateData(
        addMessage(data, text || `${c.file}: ${asset.name}`, asset.name, replyTo, undefined, lang),
      );
    setText("");
    setReplyTo(undefined);
  };
  const addDoc = async () => {
    if (!api || !documentProjectId) return;
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    const asset = !result.canceled ? result.assets[0] : undefined;
    if (!asset) return;
    try {
      const local = await fetch(asset.uri);
      if (!local.ok) throw new Error('file_read_failed');
      const upload = await api.request('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/pdf', 'idempotency-key': `document:${documentProjectId}:${asset.name}:${Date.now()}`, 'x-file-name': asset.name }, body: await local.blob() });
      if (!upload.ok) throw new Error(`Upload HTTP ${upload.status}`);
      const uploaded = await upload.json() as { url: string };
      const response = await api.request(`/api/objects/${encodeURIComponent(documentProjectId)}/documents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: asset.name.replace(/\.pdf$/i, ''), kind: 'project', fileUrl: uploaded.url }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json() as { id: string; objectId: string; title: string; version: number; fileUrl: string; status: string; createdAt: string };
      updateData({ ...data, documents: [{ id: created.id, projectId: created.objectId, name: created.title, version: created.version, uri: created.fileUrl, status: created.status, createdAt: created.createdAt }, ...data.documents] });
    } catch (error) { Alert.alert(c.uploadFailed, error instanceof Error ? error.message : c.serverError); }
  };
  const toggleRecord = async () => {
    if (!recording) {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted)
        return Alert.alert(
          c.micTitle,
          c.micBody,
        );
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } else {
      await recorder.stop();
      setRecording(false);
      updateData(addJournalEntry(data, text, lang, recorder.uri ?? undefined));
      setText("");
    }
  };
  const names =
    lang === "uz"
      ? { feed: "Lenta", journal: "Jurnal", docs: "Hujjatlar", acts: "Dalolatnoma" }
      : lang === "en"
        ? { feed: "Feed", journal: "Journal", docs: "Documents", acts: "Acts" }
        : { feed: "Лента", journal: "Журнал", docs: "Документы", acts: "Акты" };
  return (
    <View>
      <Text style={s.eyebrow}>{c.eyebrow}</Text>
      <Text style={s.h1}>{c.title}</Text>
      <View style={s.segment}>
        {(["docs", "acts"] as const).map((x) => (
          <Pressable
            key={x}
            style={[s.segmentBtn, section === x && s.segmentActive]}
            onPress={() => setSection(x)}
          >
            <Text style={section === x ? s.segmentTextActive : s.segmentText}>
              {names[x]}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={query} onChangeText={setQuery} placeholder={c.search} style={s.search} />
      {section === "feed" && (
        <View>
          {replyTo && <Text style={s.note}>{c.threadReply} {replyTo}</Text>}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={c.message}
            multiline
            style={s.input}
          />
          <View style={s.compose}>
            <Pressable style={s.miniBtn} onPress={attach}>
              <Text style={s.link}>{c.addFile}</Text>
            </Pressable>
            <Pressable style={s.primarySmall} onPress={() => void send()}>
              <Text style={s.primaryText}>{c.send}</Text>
            </Pressable>
          </View>
          {data.messages.filter((m) => `${m.author} ${m.text} ${m.attachmentName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())).map((m) => (
            <View key={m.id} style={[s.card, Boolean(m.parentId) && s.thread]}>
              <Text style={s.cardTitle}>{m.author}</Text>
              <Text style={s.message}>{m.text}</Text>
              {m.attachmentName && (
                <Text style={s.attachment}>▣ {m.attachmentName}</Text>
              )}
              <Text style={s.muted}>
                {formatDateTime(m.createdAt, lang)}
              </Text>
              <View style={s.row}>
                <Pressable onPress={() => updateData(addReaction(data, m.id))}>
                  <Text style={s.link}>👍 {m.reactions}</Text>
                </Pressable>
                <Pressable onPress={() => setReplyTo(m.id)}>
                  <Text style={s.link}>{c.reply}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      {section === "journal" && (
        <View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              c.shiftDone
            }
            multiline
            style={s.input}
          />
          <Pressable
            style={[s.primary, recording && s.recording]}
            onPress={toggleRecord}
          >
            <Text style={s.primaryText}>
              {recording
                ? c.stopRecord
                : c.voiceRecord}
            </Text>
          </Pressable>
          {data.journal.filter((j) => `${j.author} ${j.text}`.toLowerCase().includes(query.trim().toLowerCase())).map((j) => (
            <View key={j.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.cardTitle}>{j.author}</Text>
                <Text style={s.priority}>{j.lang.toUpperCase()}</Text>
              </View>
              <Text style={s.message}>{j.text}</Text>
              {j.audioUri && (
                <Text style={s.attachment}>🎤 {c.voiceSaved}</Text>
              )}
              <Text style={s.muted}>
                {formatDateTime(j.createdAt, lang)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {section === "docs" && (
        <View>
          {['director', 'pm', 'foreman', 'admin'].includes(role) && <><ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>{data.projects.map((p) => <Pressable key={p.id} style={[s.filter, documentProjectId === p.id && s.filterActive]} onPress={() => setDocumentProjectId(p.id)}><Text style={documentProjectId === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}</ScrollView><Pressable style={s.primary} onPress={() => void addDoc()}><Text style={s.primaryText}>{c.uploadVersion}</Text></Pressable></>}
          {data.documents.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())).map((d) => (
            <View key={d.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.cardTitle}>{d.name}</Text>
                <Text style={s.version}>v{d.version}</Text>
              </View>
              <Text style={s.muted}>
                {projects.find((p) => p.id === d.projectId)?.name}
              </Text>
              <Text style={s.muted}>
                {formatDateTime(d.createdAt, lang)}
              </Text>
              <Pressable style={s.outlineInline} onPress={() => void shareFile(d.uri, `${d.name}.pdf`, api)}><Text style={s.outlineText}>{c.openPdf}</Text></Pressable>
              {(role === 'customer' || role === 'inspector') && d.status === 'review' && <View style={s.actionRow}>
                <Pressable style={[s.primary, s.action]} onPress={async () => {
                  if (!api) return;
                  const response = await api.request(`/api/documents/${encodeURIComponent(d.id)}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'approved' }) });
                  if (response.ok) updateData({ ...data, documents: data.documents.map((item) => item.id === d.id ? { ...item, status: 'approved' } : item) });
                  else Alert.alert(c.error, `HTTP ${response.status}`);
                }}><Text style={s.primaryText}>{c.approve}</Text></Pressable>
                <Pressable style={[s.danger, s.action]} onPress={async () => {
                  if (!api) return;
                  if (!documentNote.trim()) return Alert.alert(c.commentRequired, c.rejectionReason);
                  const response = await api.request(`/api/documents/${encodeURIComponent(d.id)}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: 'rejected', note: documentNote.trim() }) });
                  if (response.ok) updateData({ ...data, documents: data.documents.map((item) => item.id === d.id ? { ...item, status: 'rejected' } : item) });
                  else Alert.alert(c.error, `HTTP ${response.status}`);
                }}><Text style={s.primaryText}>{c.reject}</Text></Pressable>
              </View>}
              {(role === 'customer' || role === 'inspector') && d.status === 'review' && <TextInput value={documentNote} onChangeText={setDocumentNote} placeholder={c.rejectionComment} multiline style={s.input} />}
            </View>
          ))}
        </View>
      )}
      {section === "acts" && <ActsScreen lang={lang} role={role} api={api} data={data} updateData={updateData} />}
    </View>
  );
}

function ActsScreen({ lang, role, api, data, updateData }: { lang: Lang; role: Role; api: ApiClient | null; data: AppData; updateData: (d: AppData) => void }) {
  const c = lang === "uz" ? {
    completed: "Bajarilgan ishlar dalolatnomasi", hidden: "Yashirin ishlar dalolatnomasi", acceptance: "Qabul qilish dalolatnomasi",
    notReady: "Dalolatnoma tayyor emas", fillRequired: "Majburiy maydonlarni to'ldiring va barmoq bilan imzo qo'ying.",
    object: "Obyekt", date: "Sana", works: "Ishlar", contractor: "Pudratchi", customer: "Buyurtmachi", amount: "Summa", notes: "Izoh", signature: "Mas'ul shaxs imzosi", createdOffline: "StroyControl 1.0 da oflayn yaratildi",
    pdfError: "PDF xatosi", pdfErrorBody: "Hujjatni yaratish yoki yuborib bo'lmadi.", eyebrow: "StroyControl 1.0 - hujjatlar", title: "Dalolatnomalar va shakllar",
    tabWorks: "Ishlar", tabHidden: "Yashirin", tabAcceptance: "Qabul", actNumber: "Dalolatnoma raqami", workName: "Ish nomi", fingerSignature: "Barmoq bilan imzo", signHere: "Shu yerga imzo qo'ying", clearSignature: "Imzoni tozalash", createPdf: "PDF yaratish va yuborish", readyActs: "Tayyor dalolatnomalar", sendPdf: "PDF yuborish", sum: "so'm",
    error: "Xato", openAndSign: "Ochish va imzolash", review: "Tekshiruvda", signed: "Imzolangan", draft: "Qoralama",
  } : lang === "en" ? {
    completed: "Completed works act", hidden: "Hidden works act", acceptance: "Acceptance act",
    notReady: "Act is not ready", fillRequired: "Complete the required fields and add a finger signature.",
    object: "Site", date: "Date", works: "Works", contractor: "Contractor", customer: "Customer", amount: "Amount", notes: "Notes", signature: "Responsible person's signature", createdOffline: "Created offline in StroyControl 1.0",
    pdfError: "PDF error", pdfErrorBody: "Could not create or send the document.", eyebrow: "StroyControl 1.0 - documents", title: "Acts and forms",
    tabWorks: "Works", tabHidden: "Hidden", tabAcceptance: "Acceptance", actNumber: "Act number", workName: "Work description", fingerSignature: "Finger signature", signHere: "Sign here", clearSignature: "Clear signature", createPdf: "Create and send PDF", readyActs: "Completed acts", sendPdf: "Send PDF", sum: "UZS",
    error: "Error", openAndSign: "Open and sign", review: "In review", signed: "Signed", draft: "Draft",
  } : {
    completed: "Акт выполненных работ", hidden: "Акт скрытых работ", acceptance: "Акт приемки",
    notReady: "Акт не готов", fillRequired: "Заполни обязательные поля и поставь подпись пальцем.",
    object: "Объект", date: "Дата", works: "Работы", contractor: "Подрядчик", customer: "Заказчик", amount: "Сумма", notes: "Примечание", signature: "Подпись ответственного", createdOffline: "Создано офлайн в StroyControl 1.0",
    pdfError: "Ошибка PDF", pdfErrorBody: "Не удалось сформировать или отправить документ.", eyebrow: "StroyControl 1.0 - документы", title: "Акты и формы",
    tabWorks: "Работы", tabHidden: "Скрытые", tabAcceptance: "Приемка", actNumber: "Номер акта", workName: "Наименование работ", fingerSignature: "Подпись пальцем", signHere: "Распишись здесь", clearSignature: "Очистить подпись", createPdf: "Создать и отправить PDF", readyActs: "Готовые акты", sendPdf: "Отправить PDF", sum: "сум",
    error: "Ошибка", openAndSign: "Открыть и подписать", review: "На проверке", signed: "Подписан", draft: "Черновик",
  };
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? "");
  const [template, setTemplate] = useState<"completed" | "hidden" | "acceptance">("completed");
  const [number, setNumber] = useState("");
  const [title, setTitle] = useState("");
  const [contractor, setContractor] = useState("");
  const [customer, setCustomer] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<{ x: number; y: number }[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const pan = useRef(PanResponder.create({ onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true, onPanResponderGrant: (e) => setSignature([{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]), onPanResponderMove: (e) => setSignature((old) => [...old.slice(-300), { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]) })).current;
  const names = { completed: c.completed, hidden: c.hidden, acceptance: c.acceptance } as const;
  const actStatus = (value?: string) => value === 'review' ? c.review : value === 'signed' ? c.signed : value === 'draft' ? c.draft : value;
  const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const createPdf = async () => {
    const next = createWorkAct(data, { projectId, template, number, title, contractor, customer, amount: Number(amount.replace(",", ".")), date, notes, signature });
    if (next === data) return Alert.alert(c.notReady, c.fillRequired);
    const act = next.acts[0]!;
    const project = data.projects.find((p) => p.id === projectId)?.name ?? "-";
    const dots = signature.map((p) => `<i style="left:${Math.round(p.x)}px;top:${Math.round(p.y)}px"></i>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:36px;color:#17211d}h1{text-align:center;font-size:22px}table{width:100%;border-collapse:collapse;margin:24px 0}td{border:1px solid #bbb;padding:9px}.sign{position:relative;width:280px;height:110px;border-bottom:1px solid #333}.sign i{position:absolute;width:3px;height:3px;background:#111;border-radius:2px}small{color:#666}</style></head><body><h1>${names[template]} № ${escape(number)}</h1><p>${c.object}: <b>${escape(project)}</b></p><p>${c.date}: ${escape(date)}</p><table><tr><td>${c.works}</td><td>${escape(title)}</td></tr><tr><td>${c.contractor}</td><td>${escape(contractor)}</td></tr><tr><td>${c.customer}</td><td>${escape(customer)}</td></tr><tr><td>${c.amount}</td><td>${Number(amount.replace(",", ".")).toLocaleString(localeCode(lang))} ${c.sum}</td></tr><tr><td>${c.notes}</td><td>${escape(notes || "-")}</td></tr></table><p>${c.signature}:</p><div class="sign">${dots}</div><small>${c.createdOffline}</small></body></html>`;
    try {
      const file = await Print.printToFileAsync({ html });
      if (!api) throw new Error('api_unavailable');
      const localPdf = await fetch(file.uri);
      if (!localPdf.ok) throw new Error('pdf_read_failed');
      const upload = await api.request('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/pdf', 'idempotency-key': `act-pdf:${projectId}:${number.trim()}:${Date.now()}`, 'x-file-name': `act-${number.trim()}.pdf` }, body: await localPdf.blob() });
      if (!upload.ok) throw new Error(`Upload HTTP ${upload.status}`);
      const uploaded = await upload.json() as { url: string };
      const response = await api.request(`/api/objects/${encodeURIComponent(projectId)}/acts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template, number: number.trim(), title: title.trim(), amount: Number(amount.replace(',', '.')), pdfUrl: uploaded.url }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json() as { id: string; status: string; createdAt: string };
      const completed = attachActPdf(next, act.id, file.uri);
      updateData({ ...completed, acts: completed.acts.map((item) => item.id === act.id ? { ...item, id: created.id, status: created.status, createdAt: created.createdAt } : item), queue: completed.queue.filter((item) => item.entityId !== act.id) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: names[template] });
      setNumber(""); setTitle(""); setAmount(""); setNotes(""); setSignature([]);
    } catch { Alert.alert(c.pdfError, c.pdfErrorBody); }
  };
  const sharePdf = async (uri?: string) => { if (uri) await shareFile(uri, 'act.pdf', api); };
  return <View>
    <Text style={s.eyebrow}>{c.eyebrow}</Text><Text style={s.h1}>{c.title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>{data.projects.map((p) => <Pressable key={p.id} style={[s.filter, projectId === p.id && s.filterActive]} onPress={() => setProjectId(p.id)}><Text style={projectId === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}</ScrollView>
    <View style={s.segment}>{(["completed", "hidden", "acceptance"] as const).map((x) => <Pressable key={x} style={[s.segmentBtn, template === x && s.segmentActive]} onPress={() => setTemplate(x)}><Text style={template === x ? s.segmentTextActive : s.segmentText}>{x === "completed" ? c.tabWorks : x === "hidden" ? c.tabHidden : c.tabAcceptance}</Text></Pressable>)}</View>
    {['director', 'pm', 'foreman', 'admin'].includes(role) && <View style={s.card}><Text style={s.cardTitle}>{names[template]}</Text>
      <TextInput value={number} onChangeText={setNumber} placeholder={c.actNumber} style={s.field} /><TextInput value={title} onChangeText={setTitle} placeholder={c.workName} multiline style={s.input} /><TextInput value={contractor} onChangeText={setContractor} placeholder={c.contractor} style={s.field} /><TextInput value={customer} onChangeText={setCustomer} placeholder={c.customer} style={s.field} /><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={c.amount} style={s.field} /><TextInput value={date} onChangeText={setDate} placeholder={c.date} style={s.field} /><TextInput value={notes} onChangeText={setNotes} placeholder={c.notes} multiline style={s.input} />
      <Text style={s.label}>{c.fingerSignature}</Text><View style={s.signaturePad} {...pan.panHandlers}>{signature.map((p, i) => <View key={i} style={[s.signatureDot, { left: p.x, top: p.y }]} />)}{signature.length === 0 && <Text style={s.signatureHint}>{c.signHere}</Text>}</View><Pressable style={s.outlineInline} onPress={() => setSignature([])}><Text style={s.outlineText}>{c.clearSignature}</Text></Pressable><Pressable style={s.primary} onPress={createPdf}><Text style={s.primaryText}>{c.createPdf}</Text></Pressable>
    </View>}
    <Text style={s.section}>{c.readyActs}</Text>{data.acts.map((x) => <View key={x.id} style={s.card}><View style={s.row}><Text style={[s.cardTitle, s.flex]}>{names[x.template]} № {x.number}</Text><Text style={s.status}>{actStatus(x.status) ?? x.date}</Text></View><Text style={s.muted}>{x.title} - {data.projects.find((p) => p.id === x.projectId)?.name}</Text>{x.pdfUri && <Pressable style={s.outlineInline} onPress={() => sharePdf(x.pdfUri)}><Text style={s.outlineText}>{c.sendPdf}</Text></Pressable>}{(role === 'customer' || role === 'inspector') && x.status === 'review' && <Pressable style={s.primary} onPress={async () => { if (!api) return; const response = await api.request(`/api/acts/${encodeURIComponent(x.id)}/sign`, { method: 'POST' }); if (response.ok) updateData({ ...data, acts: data.acts.map((item) => item.id === x.id ? { ...item, status: 'signed', signedAt: new Date().toISOString() } : item) }); else Alert.alert(c.error, `HTTP ${response.status}`); }}><Text style={s.primaryText}>{c.openAndSign}</Text></Pressable>}</View>)}
  </View>;
}

function SupplyScreen({
  lang,
  data,
  updateData,
  backHome,
  initialMaterialId,
  initialSection,
  autoScanner,
}: {
  lang: Lang;
  data: AppData;
  updateData: (d: AppData) => void;
  backHome: () => void;
  initialMaterialId: string | null;
  initialSection: "safety" | "tools" | null;
  autoScanner: boolean;
}) {
  const [section, setSection] = useState<
    "requests" | "warehouse" | "tools" | "shifts" | "safety"
  >("requests");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [neededAt, setNeededAt] = useState("");
  const [scanner, setScanner] = useState(false);
  const [scanned, setScanned] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const activeTool = data.tools.find((x) => x.qr === scanned);
  const c = lang === "uz" ? {
    draft: "Qoralama", ordered: "Buyurtma berildi", delivered: "Yetkazildi",
    available: "Omborda", issued: "Berilgan", repair: "Ta'mirda",
    requestMissing: "Arizani to'ldiring", requestMissingBody: "Material, miqdor va kerakli sanani kiriting.",
    cameraTitle: "Kamera kerak", cameraBody: "Asbob QR-kodini skanerlash uchun kameraga ruxsat bering.",
    requests: "Arizalar", warehouse: "Ombor", tools: "Asboblar", shifts: "Tabel", safety: "MM",
    eyebrow: "APK 0.8 - ombor va tabel", title: "Qurilish maydoni hisobi", newRequest: "Yangi ariza",
    item: "Material yoki uskuna", quantityExample: "Miqdor, masalan 20 t", neededAtExample: "Kerakli sana: 2026-08-05",
    saveOffline: "Oflayn saqlash", quantity: "Miqdor", neededAt: "Kerakli sana", order: "Buyurtmaga yuborish",
    acceptDelivery: "Yetkazib berishni qabul qilish", scanQr: "QR-kodni skanerlash", pointCamera: "Kamerani asbob QR-kodiga qarating",
    qrNotFound: "QR topilmadi", toolFound: "Asbob topildi", inventoryQr: "Inventar QR", serial: "Seriya raqami",
    status: "Holat", location: "Joy", holder: "Kimda", issueMe: "Menga berish", returnWarehouse: "Omborga qaytarish",
    toolRegistry: "Asboblar reestri", syncQueue: "Sinxronlash navbatida",
  } : lang === "en" ? {
    draft: "Draft", ordered: "Ordered", delivered: "Delivered",
    available: "In warehouse", issued: "Issued", repair: "Under repair",
    requestMissing: "Complete the request", requestMissingBody: "Enter the material, quantity, and required date.",
    cameraTitle: "Camera required", cameraBody: "Allow camera access to scan the tool QR code.",
    requests: "Requests", warehouse: "Warehouse", tools: "Tools", shifts: "Timesheet", safety: "Safety",
    eyebrow: "StroyControl 1.0 - warehouse and timesheet", title: "Construction site inventory", newRequest: "New request",
    item: "Material or equipment", quantityExample: "Quantity, for example 20 t", neededAtExample: "Required by: 2026-08-05",
    saveOffline: "Save offline", quantity: "Quantity", neededAt: "Required by", order: "Send to order",
    acceptDelivery: "Accept delivery", scanQr: "Scan QR", pointCamera: "Point the camera at the tool QR code",
    qrNotFound: "QR not found", toolFound: "Tool found", inventoryQr: "Inventory QR", serial: "Serial number",
    status: "Status", location: "Location", holder: "Holder", issueMe: "Issue to me", returnWarehouse: "Return to warehouse",
    toolRegistry: "Tool registry", syncQueue: "In sync queue",
  } : {
    draft: "Черновик", ordered: "Заказано", delivered: "Доставлено",
    available: "На складе", issued: "Выдан", repair: "В ремонте",
    requestMissing: "Заполни заявку", requestMissingBody: "Укажи материал, количество и дату потребности.",
    cameraTitle: "Нужна камера", cameraBody: "Разреши камеру для сканирования QR инструмента.",
    requests: "Заявки", warehouse: "Склад", tools: "Инструмент", shifts: "Табель", safety: "ТБ",
    eyebrow: "APK 0.8 - склад и табель", title: "Учет стройплощадки", newRequest: "Новая заявка",
    item: "Материал или оборудование", quantityExample: "Количество, например 20 т", neededAtExample: "Нужно к: 2026-08-05",
    saveOffline: "Сохранить офлайн", quantity: "Количество", neededAt: "Нужно к", order: "Передать в заказ",
    acceptDelivery: "Принять поставку", scanQr: "Сканировать QR", pointCamera: "Наведи камеру на QR инструмента",
    qrNotFound: "QR не найден", toolFound: "Инструмент найден", inventoryQr: "Инвентарный QR", serial: "Серийный номер",
    status: "Статус", location: "Место", holder: "У кого", issueMe: "Выдать мне", returnWarehouse: "Вернуть на склад",
    toolRegistry: "Реестр инструмента", syncQueue: "В очереди синхронизации",
  };
  useEffect(() => { if (initialMaterialId) setSection("warehouse"); }, [initialMaterialId]);
  useEffect(() => { if (initialSection) setSection(initialSection); }, [initialSection]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (scanner) {
          setScanner(false);
          return true;
        }
        if (scanned) {
          setScanned(null);
          return true;
        }
        if (section !== "requests") {
          setSection("requests");
          return true;
        }
        backHome();
        return true;
      },
    );
    return () => subscription.remove();
  }, [scanner, scanned, section]);
  const status = { draft: c.draft, ordered: c.ordered, delivered: c.delivered } as const;
  const toolStatus = { available: c.available, issued: c.issued, repair: c.repair } as const;
  const create = () => {
    const next = createSupplyRequest(data, item, quantity, neededAt, undefined, lang);
    if (next === data)
      return Alert.alert(
        c.requestMissing,
        c.requestMissingBody,
      );
    updateData(next);
    setItem("");
    setQuantity("");
    setNeededAt("");
  };
  const openScanner = async () => {
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted)
      return Alert.alert(
        c.cameraTitle,
        c.cameraBody,
      );
    setScanned(null);
    setScanner(true);
  };
  useEffect(() => { if (autoScanner) void openScanner(); }, [autoScanner]);
  const sectionNames = {
    requests: c.requests,
    warehouse: c.warehouse,
    tools: c.tools,
    shifts: c.shifts,
    safety: c.safety,
  } as const;
  return (
    <View>
      <Text style={s.eyebrow}>{c.eyebrow}</Text>
      <Text style={s.h1}>{c.title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filters}
      >
        {(Object.keys(sectionNames) as (keyof typeof sectionNames)[]).map(
          (x) => (
            <Pressable
              key={x}
              style={[s.filter, section === x && s.filterActive]}
              onPress={() => setSection(x)}
            >
              <Text style={section === x ? s.filterTextActive : s.filterText}>
                {sectionNames[x]}
              </Text>
            </Pressable>
          ),
        )}
      </ScrollView>
      {section === "requests" && (
        <View>
          <View style={s.card}>
            <Text style={s.cardTitle}>{c.newRequest}</Text>
            <TextInput
              value={item}
              onChangeText={setItem}
              placeholder={c.item}
              style={s.field}
            />
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              placeholder={c.quantityExample}
              style={s.field}
            />
            <TextInput
              value={neededAt}
              onChangeText={setNeededAt}
              placeholder={c.neededAtExample}
              style={s.field}
            />
            <Pressable style={s.primary} onPress={create}>
              <Text style={s.primaryText}>{c.saveOffline}</Text>
            </Pressable>
          </View>
          {data.supplyRequests.map((x) => (
            <View key={x.id} style={s.card}>
              <View style={s.row}>
                <Text style={s.cardTitle}>{x.item}</Text>
                <Text style={s.status}>{status[x.status]}</Text>
              </View>
              <Line k={c.quantity} v={x.quantity} />
              <Line k={c.neededAt} v={x.neededAt} />
              <Text style={s.muted}>
                {projects.find((p) => p.id === x.projectId)?.name} - {x.author}
              </Text>
              {x.status !== "delivered" && (
                <Pressable
                  style={s.outlineInline}
                  onPress={() => updateData(advanceSupplyRequest(data, x.id))}
                >
                  <Text style={s.outlineText}>
                    {x.status === "draft"
                      ? c.order
                      : c.acceptDelivery}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
      {section === "tools" && (
        <View>
          <Pressable style={s.primary} onPress={openScanner}>
            <Text style={s.primaryText}>{c.scanQr}</Text>
          </Pressable>
          {scanner && (
            <View style={s.scannerWrap}>
              <CameraView
                style={s.scanner}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data: value }) => {
                  setScanned(value);
                  setScanner(false);
                }}
              />
              <Text style={s.scannerText}>{c.pointCamera}</Text>
            </View>
          )}
          {scanned && !activeTool && (
            <View style={s.note}>
              <Text>{c.qrNotFound}: {scanned}</Text>
            </View>
          )}
          {activeTool && (
            <View style={s.toolFound}>
              <Text style={s.eyebrow}>{c.toolFound}</Text>
              <Text style={s.cardTitle}>{activeTool.name}</Text>
              <Line k={c.inventoryQr} v={activeTool.qr} />
              <Line k={c.serial} v={activeTool.serial} />
              <Line k={c.status} v={toolStatus[activeTool.status]} />
              <Line k={c.location} v={activeTool.location} />
              {activeTool.holder && <Line k={c.holder} v={activeTool.holder} />}
              {activeTool.status !== "repair" && (
                <Pressable
                  style={s.primary}
                  onPress={() =>
                    updateData(toggleToolIssue(data, activeTool.id, '', undefined, lang))
                  }
                >
                  <Text style={s.primaryText}>
                    {activeTool.status === "available"
                      ? c.issueMe
                      : c.returnWarehouse}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          <Text style={s.section}>{c.toolRegistry}</Text>
          {data.tools.map((x) => (
            <Pressable
              key={x.id}
              style={s.card}
              onPress={() => setScanned(x.qr)}
            >
              <View style={s.row}>
                <Text style={[s.cardTitle, s.flex]}>{x.name}</Text>
                <Text style={[s.status, x.status === "repair" && s.bad]}>
                  {toolStatus[x.status]}
                </Text>
              </View>
              <Text style={s.muted}>
                {x.qr} - {x.location}
              </Text>
              {x.holder && <Text style={s.muted}>{c.holder}: {x.holder}</Text>}
            </Pressable>
          ))}
        </View>
      )}
      {section === "warehouse" && (
        <WarehouseScreen lang={lang} data={data} updateData={updateData} initialMaterialId={initialMaterialId} />
      )}
      {section === "shifts" && (
        <ShiftsScreen lang={lang} data={data} updateData={updateData} />
      )}
      {section === "safety" && (
        <SafetyScreen lang={lang} data={data} updateData={updateData} />
      )}
      <Text style={s.queue}>{c.syncQueue}: {data.queue.length}</Text>
    </View>
  );
}

function WarehouseScreen({
  lang,
  data,
  updateData,
  initialMaterialId,
}: {
  lang: Lang;
  data: AppData;
  updateData: (d: AppData) => void;
  initialMaterialId: string | null;
}) {
  const [materialId, setMaterialId] = useState(data.materials[0]?.id ?? "");
  const [kind, setKind] = useState<"receipt" | "writeoff">("receipt");
  const [quantity, setQuantity] = useState("");
  const [stage, setStage] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [materialName, setMaterialName] = useState("");
  const [unit, setUnit] = useState("");
  const [minimum, setMinimum] = useState("");
  const [location, setLocation] = useState("");
  const [materialProjectId, setMaterialProjectId] = useState(projects[0]?.id ?? "");
  const c = lang === "uz" ? {
    notSaved: "Saqlanmadi", materialRequired: "Obyekt, nom, birlik, ombor va to'g'ri minimumni kiriting.",
    operationNotSaved: "Operatsiya saqlanmadi", operationCheck: "Miqdor va mavjud qoldiqni tekshiring.",
    openedNotification: "Bildirishnomadan ochildi", balance: "Qoldiq", minimum: "Minimum", location: "Joy",
    positions: "Pozitsiyalar", belowMinimum: "Minimumdan kam", search: "Material yoki ombor bo'yicha qidirish",
    object: "Obyekt", all: "Barchasi", editMaterial: "Materialni tahrirlash", newMaterial: "Yangi material",
    materialName: "Material nomi", unit: "Birlik: t, kg, dona", minimumBalance: "Minimal qoldiq",
    warehouseZone: "Ombor yoki saqlash zonasi", saveChanges: "O'zgarishlarni saqlash", addMaterial: "Material qo'shish",
    cancel: "Bekor qilish", stockOperation: "Kirim yoki hisobdan chiqarish", receipt: "Kirim", writeoff: "Hisobdan chiqarish",
    quantity: "Miqdor", workStage: "Ish bosqichi", commentInvoice: "Izoh yoki yukxat", saveOperation: "Operatsiyani saqlash",
    balances: "Qoldiqlar", minimumShort: "minimum", edit: "O'zgartirish", replenish: "Zaxirani to'ldirish kerak",
    recentOperations: "So'nggi operatsiyalar", noComment: "Izohsiz",
  } : lang === "en" ? {
    notSaved: "Not saved", materialRequired: "Enter the site, name, unit, warehouse, and a valid minimum.",
    operationNotSaved: "Operation not saved", operationCheck: "Check the quantity and available balance.",
    openedNotification: "Opened from notification", balance: "Balance", minimum: "Minimum", location: "Location",
    positions: "Items", belowMinimum: "Below minimum", search: "Search by material or warehouse",
    object: "Site", all: "All", editMaterial: "Edit material", newMaterial: "New material",
    materialName: "Material name", unit: "Unit: t, kg, pcs", minimumBalance: "Minimum balance",
    warehouseZone: "Warehouse or storage area", saveChanges: "Save changes", addMaterial: "Add material",
    cancel: "Cancel", stockOperation: "Receipt or write-off", receipt: "Receipt", writeoff: "Write-off",
    quantity: "Quantity", workStage: "Work stage", commentInvoice: "Comment or invoice", saveOperation: "Save operation",
    balances: "Balances", minimumShort: "minimum", edit: "Edit", replenish: "Stock needs replenishment",
    recentOperations: "Recent operations", noComment: "No comment",
  } : {
    notSaved: "Не сохранено", materialRequired: "Заполни объект, название, единицу, склад и корректный минимум.",
    operationNotSaved: "Операция не сохранена", operationCheck: "Проверь количество и доступный остаток.",
    openedNotification: "Открыто из уведомления", balance: "Остаток", minimum: "Минимум", location: "Место",
    positions: "Позиций", belowMinimum: "Ниже минимума", search: "Поиск по материалу или складу",
    object: "Объект", all: "Все", editMaterial: "Редактировать материал", newMaterial: "Новый материал",
    materialName: "Название материала", unit: "Единица: т, кг, шт", minimumBalance: "Минимальный остаток",
    warehouseZone: "Склад или зона хранения", saveChanges: "Сохранить изменения", addMaterial: "Добавить материал",
    cancel: "Отмена", stockOperation: "Приход или списание", receipt: "Приход", writeoff: "Списание",
    quantity: "Количество", workStage: "Этап работ", commentInvoice: "Комментарий или накладная", saveOperation: "Сохранить операцию",
    balances: "Остатки", minimumShort: "минимум", edit: "Изменить", replenish: "Нужно пополнить запас",
    recentOperations: "Последние операции", noComment: "Без комментария",
  };
  const openedMaterial = data.materials.find((x) => x.id === initialMaterialId);
  useEffect(() => {
    if (!openedMaterial) return;
    setMaterialId(openedMaterial.id);
    setProjectFilter(openedMaterial.projectId);
    setQuery(openedMaterial.name);
  }, [initialMaterialId]);
  const materialResults = data.materials.filter((x) => (projectFilter === "all" || x.projectId === projectFilter) && `${x.name} ${x.location}`.toLowerCase().includes(query.trim().toLowerCase()));
  const editMaterial = (id?: string) => {
    const current = data.materials.find((x) => x.id === id);
    setEditingId(current?.id);
    setMaterialName(current?.name ?? "");
    setUnit(current?.unit ?? "");
    setMinimum(current ? String(current.minimum) : "");
    setLocation(current?.location ?? "");
    setMaterialProjectId(current?.projectId ?? projects[0]?.id ?? "");
  };
  const storeMaterial = () => {
    const next = saveMaterial(data, { id: editingId, projectId: materialProjectId, name: materialName, unit, minimum: Number(minimum.replace(",", ".")), location });
    if (next === data) return Alert.alert(c.notSaved, c.materialRequired);
    updateData(next);
    editMaterial();
  };
  const save = () => {
    const next = moveStock(
      data,
      materialId,
      kind,
      Number(quantity.replace(",", ".")),
      stage,
      note,
    );
    if (next === data)
      return Alert.alert(
        c.operationNotSaved,
        c.operationCheck,
      );
    updateData(next);
    setQuantity("");
    setStage("");
    setNote("");
  };
  return (
    <View>
      {openedMaterial && <View style={[s.card, s.noticeWarning]}><Text style={s.eyebrow}>{c.openedNotification}</Text><Text style={s.cardTitle}>{openedMaterial.name}</Text><Line k={c.balance} v={`${openedMaterial.quantity} ${openedMaterial.unit}`} bad={openedMaterial.quantity <= openedMaterial.minimum} /><Line k={c.minimum} v={`${openedMaterial.minimum} ${openedMaterial.unit}`} /><Line k={c.location} v={openedMaterial.location} /></View>}
      <View style={s.metrics}>
        <Metric value={String(data.materials.length)} label={c.positions} />
        <Metric
          value={String(
            data.materials.filter((x) => x.quantity <= x.minimum).length,
          )}
          label={c.belowMinimum}
          bad
        />
      </View>
      <TextInput value={query} onChangeText={setQuery} placeholder={c.search} style={s.search} />
      <Text style={s.section}>{c.object}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>
        <Pressable style={[s.filter, projectFilter === "all" && s.filterActive]} onPress={() => setProjectFilter("all")}><Text style={projectFilter === "all" ? s.filterTextActive : s.filterText}>{c.all}</Text></Pressable>
        {projects.map((p) => <Pressable key={p.id} style={[s.filter, projectFilter === p.id && s.filterActive]} onPress={() => setProjectFilter(p.id)}><Text style={projectFilter === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}
      </ScrollView>
      <View style={s.card}>
        <Text style={s.cardTitle}>{editingId ? c.editMaterial : c.newMaterial}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>{projects.map((p) => <Pressable key={p.id} style={[s.filter, materialProjectId === p.id && s.filterActive]} onPress={() => setMaterialProjectId(p.id)}><Text style={materialProjectId === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}</ScrollView>
        <TextInput value={materialName} onChangeText={setMaterialName} placeholder={c.materialName} style={s.field} />
        <TextInput value={unit} onChangeText={setUnit} placeholder={c.unit} style={s.field} />
        <TextInput value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" placeholder={c.minimumBalance} style={s.field} />
        <TextInput value={location} onChangeText={setLocation} placeholder={c.warehouseZone} style={s.field} />
        <Pressable style={s.primary} onPress={storeMaterial}><Text style={s.primaryText}>{editingId ? c.saveChanges : c.addMaterial}</Text></Pressable>
        {editingId && <Pressable style={s.outlineInline} onPress={() => editMaterial()}><Text style={s.outlineText}>{c.cancel}</Text></Pressable>}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>{c.stockOperation}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filters}
        >
          {materialResults.map((x) => (
            <Pressable
              key={x.id}
              style={[s.filter, materialId === x.id && s.filterActive]}
              onPress={() => setMaterialId(x.id)}
            >
              <Text
                style={materialId === x.id ? s.filterTextActive : s.filterText}
              >
                {x.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.segment}>
          <Pressable
            style={[s.segmentBtn, kind === "receipt" && s.segmentActive]}
            onPress={() => setKind("receipt")}
          >
            <Text
              style={kind === "receipt" ? s.segmentTextActive : s.segmentText}
            >
              {c.receipt}
            </Text>
          </Pressable>
          <Pressable
            style={[s.segmentBtn, kind === "writeoff" && s.segmentActive]}
            onPress={() => setKind("writeoff")}
          >
            <Text
              style={kind === "writeoff" ? s.segmentTextActive : s.segmentText}
            >
              {c.writeoff}
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
          placeholder={c.quantity}
          style={s.field}
        />
        <TextInput
          value={stage}
          onChangeText={setStage}
          placeholder={c.workStage}
          style={s.field}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={c.commentInvoice}
          style={s.field}
        />
        <Pressable style={s.primary} onPress={save}>
          <Text style={s.primaryText}>{c.saveOperation}</Text>
        </Pressable>
      </View>
      <Text style={s.section}>{c.balances}</Text>
      {materialResults.map((x) => (
        <View key={x.id} style={s.card}>
          <View style={s.row}>
            <Text style={[s.cardTitle, s.flex]}>{x.name}</Text>
            <Text style={[s.lineValue, x.quantity <= x.minimum && s.bad]}>
              {x.quantity} {x.unit}
            </Text>
          </View>
          <Text style={s.muted}>
            {projects.find((p) => p.id === x.projectId)?.name} - {x.location} - {c.minimumShort} {x.minimum} {x.unit}
          </Text>
          <Pressable style={s.outlineInline} onPress={() => editMaterial(x.id)}><Text style={s.outlineText}>{c.edit}</Text></Pressable>
          {x.quantity <= x.minimum && (
            <Text style={s.note}>{c.replenish}</Text>
          )}
        </View>
      ))}
      <Text style={s.section}>{c.recentOperations}</Text>
      {data.stockMovements.slice(0, 10).map((x) => (
        <View key={x.id} style={s.card}>
          <View style={s.row}>
            <Text style={s.cardTitle}>
              {x.kind === "receipt" ? c.receipt : c.writeoff}
            </Text>
            <Text style={x.kind === "receipt" ? s.status : s.bad}>
              {x.kind === "receipt" ? "+" : "-"}
              {x.quantity}{" "}
              {data.materials.find((m) => m.id === x.materialId)?.unit}
            </Text>
          </View>
          <Text style={s.muted}>
            {data.materials.find((m) => m.id === x.materialId)?.name}
            {x.stage ? ` - ${x.stage}` : ""}
          </Text>
          <Text style={s.muted}>{x.note || c.noComment}</Text>
        </View>
      ))}
    </View>
  );
}

function ShiftsScreen({
  lang,
  data,
  updateData,
}: {
  lang: Lang;
  data: AppData;
  updateData: (d: AppData) => void;
}) {
  const [crewId, setCrewId] = useState(data.crews.find((x) => x.active)?.id ?? "");
  const [workers, setWorkers] = useState("");
  const [hours, setHours] = useState("8");
  const [output, setOutput] = useState("");
  const [downtime, setDowntime] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [arrival, setArrival] = useState("08:00");
  const [departure, setDeparture] = useState("17:00");
  const [stage, setStage] = useState("");
  const [projectFilter, setProjectFilter] = useState(projects[0]?.id ?? "all");
  const [dateFrom, setDateFrom] = useState(date);
  const [dateTo, setDateTo] = useState(date);
  const [crewName, setCrewName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [foreman, setForeman] = useState("");
  const [defaultWorkers, setDefaultWorkers] = useState("");
  const c = lang === "uz" ? {
    notSaved: "Saqlanmadi", crewRequired: "Nomi, mutaxassisligi, brigadiri va ishchilar sonini kiriting.",
    timesheetMissing: "Tabelni to'ldiring", timesheetBody: "Brigada, ishchilar soni, soat va sanani kiriting.",
    workerEntries: "Ishchi chiqishlari", personHours: "Kishi-soat", crewDirectory: "Brigadalar ma'lumotnomasi",
    crewName: "Brigada nomi", specialty: "Mutaxassislik", foreman: "Brigadir", staffCount: "Shtat soni",
    addCrew: "Brigada qo'shish", peopleShort: "kishi", active: "Faol", archive: "Arxiv", closeShift: "Smenani yopish",
    workersCount: "Ishchilar soni", shiftHours: "Smenadagi soatlar", arrival: "Kelish 08:00", departure: "Ketish 17:00",
    stage: "Ish bosqichi", output: "Smenadagi natija", downtimeReason: "To'xtab qolish sababi, agar bo'lsa",
    date: "Sana: 2026-08-01", saveTimesheet: "Tabelni saqlash", historyFilter: "Tarix filtri", allObjects: "Barcha obyektlar",
    fromDate: "Boshlanish sanasi", toDate: "Tugash sanasi", shiftHistory: "Smenalar tarixi", workers: "Ishchilar",
    hours: "Soatlar", object: "Obyekt", arrivalDeparture: "Kelish / ketish", outputLabel: "Natija", downtime: "To'xtash", no: "Yo'q",
  } : lang === "en" ? {
    notSaved: "Not saved", crewRequired: "Enter the crew name, specialty, foreman, and headcount.",
    timesheetMissing: "Complete the timesheet", timesheetBody: "Select a crew and enter the workers, hours, and date.",
    workerEntries: "Worker shifts", personHours: "Person-hours", crewDirectory: "Crew directory",
    crewName: "Crew name", specialty: "Specialty", foreman: "Foreman", staffCount: "Default headcount",
    addCrew: "Add crew", peopleShort: "people", active: "Active", archive: "Archived", closeShift: "Close shift",
    workersCount: "Number of workers", shiftHours: "Hours per shift", arrival: "Arrival 08:00", departure: "Departure 17:00",
    stage: "Work stage", output: "Shift output", downtimeReason: "Downtime reason, if any",
    date: "Date: 2026-08-01", saveTimesheet: "Save timesheet", historyFilter: "History filter", allObjects: "All sites",
    fromDate: "From date", toDate: "To date", shiftHistory: "Shift history", workers: "Workers",
    hours: "Hours", object: "Site", arrivalDeparture: "Arrival / departure", outputLabel: "Output", downtime: "Downtime", no: "No",
  } : {
    notSaved: "Не сохранено", crewRequired: "Заполни название, специализацию, бригадира и численность.",
    timesheetMissing: "Заполни табель", timesheetBody: "Укажи бригаду, число рабочих, часы и дату.",
    workerEntries: "Выходов рабочих", personHours: "Человеко-часов", crewDirectory: "Справочник бригад",
    crewName: "Название бригады", specialty: "Специализация", foreman: "Бригадир", staffCount: "Штатная численность",
    addCrew: "Добавить бригаду", peopleShort: "чел.", active: "Активна", archive: "Архив", closeShift: "Закрыть смену",
    workersCount: "Количество рабочих", shiftHours: "Часов в смене", arrival: "Приход 08:00", departure: "Уход 17:00",
    stage: "Этап работ", output: "Выработка за смену", downtimeReason: "Причина простоя, если был",
    date: "Дата: 2026-08-01", saveTimesheet: "Сохранить табель", historyFilter: "Фильтр истории", allObjects: "Все объекты",
    fromDate: "С даты", toDate: "По дату", shiftHistory: "История смен", workers: "Рабочих",
    hours: "Часов", object: "Объект", arrivalDeparture: "Приход / уход", outputLabel: "Выработка", downtime: "Простой", no: "Нет",
  };
  const activeCrew = data.crews.find((x) => x.id === crewId);
  const visibleShifts = data.shifts.filter((x) => (projectFilter === "all" || x.projectId === projectFilter) && (!dateFrom || x.date >= dateFrom) && (!dateTo || x.date <= dateTo));
  const createCrew = () => {
    const next = saveCrew(data, { name: crewName, specialty, foreman, defaultWorkers: Number(defaultWorkers) });
    if (next === data) return Alert.alert(c.notSaved, c.crewRequired);
    updateData(next);
    setCrewName(""); setSpecialty(""); setForeman(""); setDefaultWorkers("");
  };
  const save = () => {
    const next = addCrewShift(
      data,
      activeCrew?.name ?? "",
      Number(workers),
      Number(hours),
      output,
      downtime,
      date,
      undefined,
      { projectId: projectFilter === "all" ? projects[0]?.id : projectFilter, crewId, arrival, departure, stage },
      lang,
    );
    if (next === data)
      return Alert.alert(
        c.timesheetMissing,
        c.timesheetBody,
      );
    updateData(next);
    setWorkers("");
    setOutput("");
    setDowntime("");
  };
  const totalWorkers = visibleShifts.reduce((n, x) => n + x.workers, 0);
  const totalHours = visibleShifts.reduce((n, x) => n + x.workers * x.hours, 0);
  return (
    <View>
      <View style={s.metrics}>
        <Metric
          value={String(totalWorkers)}
          label={c.workerEntries}
        />
        <Metric
          value={String(totalHours)}
          label={c.personHours}
        />
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>{c.crewDirectory}</Text>
        <TextInput value={crewName} onChangeText={setCrewName} placeholder={c.crewName} style={s.field} />
        <TextInput value={specialty} onChangeText={setSpecialty} placeholder={c.specialty} style={s.field} />
        <TextInput value={foreman} onChangeText={setForeman} placeholder={c.foreman} style={s.field} />
        <TextInput value={defaultWorkers} onChangeText={setDefaultWorkers} keyboardType="number-pad" placeholder={c.staffCount} style={s.field} />
        <Pressable style={s.primary} onPress={createCrew}><Text style={s.primaryText}>{c.addCrew}</Text></Pressable>
        {data.crews.map((x) => <View key={x.id} style={s.line}><View style={s.flex}><Text style={s.cardTitle}>{x.name}</Text><Text style={s.muted}>{x.specialty} - {x.foreman} - {x.defaultWorkers} {c.peopleShort}</Text></View><Pressable onPress={() => updateData(toggleCrew(data, x.id))}><Text style={x.active ? s.status : s.bad}>{x.active ? c.active : c.archive}</Text></Pressable></View>)}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>{c.closeShift}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>{projects.map((p) => <Pressable key={p.id} style={[s.filter, projectFilter === p.id && s.filterActive]} onPress={() => setProjectFilter(p.id)}><Text style={projectFilter === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}</ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>{data.crews.filter((x) => x.active).map((x) => <Pressable key={x.id} style={[s.filter, crewId === x.id && s.filterActive]} onPress={() => { setCrewId(x.id); setWorkers(String(x.defaultWorkers)); }}><Text style={crewId === x.id ? s.filterTextActive : s.filterText}>{x.name}</Text></Pressable>)}</ScrollView>
        <TextInput
          value={workers}
          onChangeText={setWorkers}
          keyboardType="number-pad"
          placeholder={c.workersCount}
          style={s.field}
        />
        <TextInput
          value={hours}
          onChangeText={setHours}
          keyboardType="decimal-pad"
          placeholder={c.shiftHours}
          style={s.field}
        />
        <View style={s.actionRow}><TextInput value={arrival} onChangeText={setArrival} placeholder={c.arrival} style={[s.field, s.action]} /><TextInput value={departure} onChangeText={setDeparture} placeholder={c.departure} style={[s.field, s.action]} /></View>
        <TextInput value={stage} onChangeText={setStage} placeholder={c.stage} style={s.field} />
        <TextInput
          value={output}
          onChangeText={setOutput}
          placeholder={c.output}
          style={s.field}
        />
        <TextInput
          value={downtime}
          onChangeText={setDowntime}
          placeholder={c.downtimeReason}
          style={s.field}
        />
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder={c.date}
          style={s.field}
        />
        <Pressable style={s.primary} onPress={save}>
          <Text style={s.primaryText}>{c.saveTimesheet}</Text>
        </Pressable>
      </View>
      <Text style={s.section}>{c.historyFilter}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}><Pressable style={[s.filter, projectFilter === "all" && s.filterActive]} onPress={() => setProjectFilter("all")}><Text style={projectFilter === "all" ? s.filterTextActive : s.filterText}>{c.allObjects}</Text></Pressable>{projects.map((p) => <Pressable key={p.id} style={[s.filter, projectFilter === p.id && s.filterActive]} onPress={() => setProjectFilter(p.id)}><Text style={projectFilter === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}</ScrollView>
      <View style={s.actionRow}><TextInput value={dateFrom} onChangeText={setDateFrom} placeholder={c.fromDate} style={[s.field, s.action]} /><TextInput value={dateTo} onChangeText={setDateTo} placeholder={c.toDate} style={[s.field, s.action]} /></View>
      <Text style={s.section}>{c.shiftHistory}</Text>
      {visibleShifts.map((x) => (
        <View key={x.id} style={s.card}>
          <View style={s.row}>
            <Text style={[s.cardTitle, s.flex]}>{x.crew}</Text>
            <Text style={s.status}>{x.date}</Text>
          </View>
          <Line k={c.workers} v={String(x.workers)} />
          <Line k={c.hours} v={String(x.hours)} />
          <Line k={c.object} v={projects.find((p) => p.id === x.projectId)?.name ?? "-"} />
          <Line k={c.arrivalDeparture} v={`${x.arrival ?? "-"} / ${x.departure ?? "-"}`} />
          <Line k={c.stage} v={x.stage ?? "-"} />
          <Line k={c.outputLabel} v={x.output || "-"} />
          <Line k={c.downtime} v={x.downtime} bad={Boolean(x.downtime) && x.downtime !== "Нет" && x.downtime !== "Yo'q" && x.downtime !== "No"} />
        </View>
      ))}
    </View>
  );
}

const safetyTemplateRu = [
  "Каски и СИЗ у всех работников",
  "Ограждения и проходы исправны",
  "Электрика и инструмент проверены",
  "Пожарные выходы свободны",
  "Инструктаж перед сменой проведен",
];

const safetyTemplateUz = [
  "Barcha ishchilarda kaska va SHHV bor",
  "To'siqlar va yo'laklar soz",
  "Elektr jihozlari va asboblar tekshirilgan",
  "Yong'in chiqish yo'llari ochiq",
  "Smena oldidan yo'riqnoma o'tkazilgan",
];

const safetyTemplateEn = [
  "All workers have helmets and PPE",
  "Barriers and walkways are in good condition",
  "Electrical equipment and tools have been checked",
  "Fire exits are clear",
  "Pre-shift safety briefing has been completed",
];

function SafetyScreen({ lang, data, updateData }: { lang: Lang; data: AppData; updateData: (d: AppData) => void }) {
  const c = lang === "uz" ? {
    template: safetyTemplateUz, checklistMissing: "Tekshiruv ro'yxati tayyor emas", checklistBody: "Barcha bandlarni belgilang, mas'ul shaxsni kiriting va imzo qo'ying.", cameraTitle: "Kamera kerak", cameraBody: "Qoidabuzarlikni qayd etish uchun kameraga ruxsat bering.", violationMissing: "Qoidabuzarlik saqlanmadi", violationBody: "Tavsif va mas'ul shaxsni kiriting hamda foto oling.", open: "Ochiq", fixing: "Bartaraf etilmoqda", closed: "Bartaraf etildi", eyebrow: "StroyControl 1.0 - mehnat xavfsizligi", title: "Mehnat muhofazasi", checks: "Tekshiruvlar", violations: "Qoidabuzarliklar", daily: "Kundalik tekshiruv ro'yxati", checkResponsible: "Tekshiruv uchun mas'ul", fingerSignature: "Barmoq bilan imzo", signHere: "Shu yerga imzo qo'ying", clearSignature: "Imzoni tozalash", finish: "Tekshiruvni yakunlash", recordViolation: "Qoidabuzarlikni qayd etish", violationDescription: "Qoidabuzarlik tavsifi", fixResponsible: "Bartaraf etish uchun mas'ul", retakePhoto: "Fotoni qayta olish", takePhoto: "Foto olish va geolokatsiyani yozish", saveViolation: "Qoidabuzarlikni saqlash", log: "Qoidabuzarliklar jurnali", object: "Obyekt", responsible: "Mas'ul", time: "Vaqt", startFix: "Bartaraf etishni boshlash", markFixed: "Bartaraf etildi deb belgilash",
  } : lang === "en" ? {
    template: safetyTemplateEn, checklistMissing: "Checklist is not ready", checklistBody: "Complete every item, enter the responsible person, and add a finger signature.", cameraTitle: "Camera required", cameraBody: "Allow camera access to record the violation.", violationMissing: "Violation not saved", violationBody: "Enter a description and responsible person, then take a photo.", open: "Open", fixing: "Being resolved", closed: "Resolved", eyebrow: "StroyControl 1.0 - safety", title: "Occupational safety", checks: "Inspections", violations: "Violations", daily: "Daily safety checklist", checkResponsible: "Responsible for inspection", fingerSignature: "Finger signature", signHere: "Sign here", clearSignature: "Clear signature", finish: "Complete inspection", recordViolation: "Record violation", violationDescription: "Violation description", fixResponsible: "Responsible for resolution", retakePhoto: "Retake photo", takePhoto: "Take photo and record location", saveViolation: "Save violation", log: "Violation log", object: "Site", responsible: "Responsible", time: "Time", startFix: "Start resolution", markFixed: "Mark as resolved",
  } : {
    template: safetyTemplateRu, checklistMissing: "Чек-лист не готов", checklistBody: "Отметь все пункты, укажи ответственного и поставь подпись пальцем.", cameraTitle: "Нужна камера", cameraBody: "Разреши доступ для фиксации нарушения.", violationMissing: "Нарушение не сохранено", violationBody: "Укажи описание, ответственного и сделай фото.", open: "Открыто", fixing: "Устраняется", closed: "Устранено", eyebrow: "StroyControl 1.0 - техника безопасности", title: "Охрана труда", checks: "Проверок", violations: "Нарушений", daily: "Ежедневный чек-лист", checkResponsible: "Ответственный за проверку", fingerSignature: "Подпись пальцем", signHere: "Распишись здесь", clearSignature: "Очистить подпись", finish: "Завершить проверку", recordViolation: "Зафиксировать нарушение", violationDescription: "Описание нарушения", fixResponsible: "Ответственный за устранение", retakePhoto: "Переснять фото", takePhoto: "Сделать фото и записать геолокацию", saveViolation: "Сохранить нарушение", log: "Журнал нарушений", object: "Объект", responsible: "Ответственный", time: "Время", startFix: "Начать устранение", markFixed: "Отметить устраненным",
  };
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [responsible, setResponsible] = useState("");
  const [items, setItems] = useState(c.template.map((text, i) => ({ id: `tb-${i}`, text, done: false })));
  useEffect(() => setItems(c.template.map((text, i) => ({ id: `tb-${i}`, text, done: false }))), [lang]);
  const [signature, setSignature] = useState<{ x: number; y: number }[]>([]);
  const [title, setTitle] = useState("");
  const [violationResponsible, setViolationResponsible] = useState("");
  const [photoUri, setPhotoUri] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude?: number; longitude?: number }>({});
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setSignature([{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]),
    onPanResponderMove: (e) => setSignature((old) => [...old.slice(-300), { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }]),
  })).current;
  const saveChecklist = () => {
    const next = saveSafetyChecklist(data, projectId, responsible, items, signature, new Date().toISOString().slice(0, 10));
    if (next === data) return Alert.alert(c.checklistMissing, c.checklistBody);
    updateData(next); setResponsible(""); setSignature([]); setItems(items.map((x) => ({ ...x, done: false })));
  };
  const takeViolationPhoto = async () => {
    const camera = await ImagePicker.requestCameraPermissionsAsync();
    if (!camera.granted) return Alert.alert(c.cameraTitle, c.cameraBody);
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setPhotoUri(result.assets[0]?.uri ?? "");
    const locationPermission = await Location.requestForegroundPermissionsAsync();
    if (locationPermission.granted) {
      const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoordinates({ latitude: point.coords.latitude, longitude: point.coords.longitude });
    }
  };
  const saveViolation = () => {
    const next = createSafetyViolation(data, { projectId, title, responsible: violationResponsible, photoUri, ...coordinates });
    if (next === data) return Alert.alert(c.violationMissing, c.violationBody);
    updateData(next); setTitle(""); setViolationResponsible(""); setPhotoUri(""); setCoordinates({});
  };
  const violationStatus = { open: c.open, fixing: c.fixing, closed: c.closed } as const;
  return <View>
    <Text style={s.eyebrow}>{c.eyebrow}</Text>
    <Text style={s.h1}>{c.title}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filters}>{projects.map((p) => <Pressable key={p.id} style={[s.filter, projectId === p.id && s.filterActive]} onPress={() => setProjectId(p.id)}><Text style={projectId === p.id ? s.filterTextActive : s.filterText}>{p.name}</Text></Pressable>)}</ScrollView>
    <View style={s.metrics}><Metric value={String(data.safetyChecklists.length)} label={c.checks} /><Metric value={String(data.safetyViolations.filter((x) => x.status !== "closed").length)} label={c.violations} bad /></View>
    <View style={s.card}>
      <Text style={s.cardTitle}>{c.daily}</Text>
      {items.map((x) => <Pressable key={x.id} style={s.checkRow} onPress={() => setItems(items.map((i) => i.id === x.id ? { ...i, done: !i.done } : i))}><Text style={x.done ? s.checkDone : s.checkBox}>{x.done ? "✓" : "○"}</Text><Text style={s.flex}>{x.text}</Text></Pressable>)}
      <TextInput value={responsible} onChangeText={setResponsible} placeholder={c.checkResponsible} style={s.field} />
      <Text style={s.label}>{c.fingerSignature}</Text>
      <View style={s.signaturePad} {...pan.panHandlers}>{signature.map((p, i) => <View key={i} style={[s.signatureDot, { left: p.x, top: p.y }]} />)}{signature.length === 0 && <Text style={s.signatureHint}>{c.signHere}</Text>}</View>
      <Pressable style={s.outlineInline} onPress={() => setSignature([])}><Text style={s.outlineText}>{c.clearSignature}</Text></Pressable>
      <Pressable style={s.primary} onPress={saveChecklist}><Text style={s.primaryText}>{c.finish}</Text></Pressable>
    </View>
    <View style={s.card}>
      <Text style={s.cardTitle}>{c.recordViolation}</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder={c.violationDescription} multiline style={s.input} />
      <TextInput value={violationResponsible} onChangeText={setViolationResponsible} placeholder={c.fixResponsible} style={s.field} />
      <Pressable style={s.outlineInline} onPress={takeViolationPhoto}><Text style={s.outlineText}>{photoUri ? c.retakePhoto : c.takePhoto}</Text></Pressable>
      {photoUri && <PhotoViewer uri={photoUri} />}
      <Pressable style={s.primary} onPress={saveViolation}><Text style={s.primaryText}>{c.saveViolation}</Text></Pressable>
    </View>
    <Text style={s.section}>{c.log}</Text>
    {data.safetyViolations.map((x) => <View key={x.id} style={s.card}><View style={s.row}><Text style={[s.cardTitle, s.flex]}>{x.title}</Text><Text style={x.status === "closed" ? s.status : s.bad}>{violationStatus[x.status]}</Text></View><Line k={c.object} v={projects.find((p) => p.id === x.projectId)?.name ?? "-"} /><Line k={c.responsible} v={x.responsible} /><Line k={c.time} v={formatDateTime(x.createdAt, lang)} /><GeoPoint lang={lang} latitude={x.latitude} longitude={x.longitude} />{x.photoUri && <PhotoViewer uri={x.photoUri} compact />}{x.status !== "closed" && <Pressable style={s.primary} onPress={() => updateData(advanceSafetyViolation(data, x.id))}><Text style={s.primaryText}>{x.status === "open" ? c.startFix : c.markFixed}</Text></Pressable>}</View>)}
  </View>;
}

function ProfileScreen({
  t,
  lang,
  setLang,
  activeRole,
  data,
  updateData,
  logout,
}: {
  t: UiCopy;
  lang: Lang;
  setLang: (v: Lang) => void;
  activeRole?: (typeof roles)[number];
  data: AppData;
  updateData: (d: AppData) => void;
  logout: () => Promise<void>;
}) {
  const c = lang === "uz" ? {
    backupDialog: "StroyControl zaxira nusxasi", copyCreated: "Nusxa yaratildi", error: "Xato",
    exportError: "Zaxira nusxasini yaratib bo'lmadi.", invalidFile: "Noto'g'ri fayl",
    invalidBackup: "Bu StroyControl 0.7 zaxira nusxasi emas.", ready: "Tayyor",
    restored: "Ma'lumotlar zaxira nusxasidan tiklandi.", damaged: "Fayl buzilgan yoki formati noto'g'ri.",
    backup: "Zaxira nusxasi", backupBody: "Barcha mahalliy ma'lumotlarni faylga saqlang yoki qayta o'rnatgandan keyin tiklang.",
    export: "Ma'lumotlarni eksport qilish", restore: "Fayldan tiklash", logout: "Hisobdan chiqish",
  } : lang === "en" ? {
    backupDialog: "StroyControl backup", copyCreated: "Backup created", error: "Error",
    exportError: "Could not create a backup.", invalidFile: "Invalid file",
    invalidBackup: "This is not a StroyControl 0.7 backup.", ready: "Done",
    restored: "Data restored from the backup.", damaged: "The file is damaged or has an invalid format.",
    backup: "Backup", backupBody: "Save all local data to a file or restore it after reinstalling the app.",
    export: "Export data", restore: "Restore from file", logout: "Sign out",
  } : {
    backupDialog: "Резервная копия StroyControl", copyCreated: "Копия создана", error: "Ошибка",
    exportError: "Не удалось создать резервную копию.", invalidFile: "Неверный файл",
    invalidBackup: "Это не резервная копия StroyControl 0.7.", ready: "Готово",
    restored: "Данные восстановлены из резервной копии.", damaged: "Файл поврежден или имеет неверный формат.",
    backup: "Резервная копия", backupBody: "Сохрани все локальные данные в файл или восстанови их после переустановки.",
    export: "Экспортировать данные", restore: "Восстановить из файла", logout: "Выйти из аккаунта",
  };
  const exportBackup = async () => {
    try {
      const uri = `${FileSystem.cacheDirectory}StroyControl-backup-${new Date().toISOString().slice(0, 10)}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(createBackup(data), null, 2));
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(uri, {
          mimeType: "application/json",
          dialogTitle: c.backupDialog,
        });
      else Alert.alert(c.copyCreated, uri);
    } catch {
      Alert.alert(c.error, c.exportError);
    }
  };
  const importBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      const asset = !result.canceled ? result.assets[0] : undefined;
      if (!asset) return;
      const restored = validateBackup(
        JSON.parse(await FileSystem.readAsStringAsync(asset.uri)),
      );
      if (!restored)
        return Alert.alert(
          c.invalidFile,
          c.invalidBackup,
        );
      updateData(restored);
      Alert.alert(c.ready, c.restored);
    } catch {
      Alert.alert(c.error, c.damaged);
    }
  };
  return (
    <View>
      <Text style={s.h1}>{t.profile}</Text>
      <View style={s.card}>
        <Text style={s.label}>{t.role}</Text>
        <Text style={s.cardTitle}>{activeRole?.[lang]}</Text>
        <Text style={s.muted}>{activeRole?.scope[lang]}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>{t.language}</Text>
        <View style={s.switcher}>
          {(["ru", "uz", "en"] as Lang[]).map((x) => (
            <Pressable
              key={x}
              style={[s.switchBtn, lang === x && s.switchActive]}
              onPress={() => setLang(x)}
            >
              <Text style={lang === x ? s.switchTextActive : s.switchText}>
                {x.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>{c.backup}</Text>
        <Text style={s.muted}>{c.backupBody}</Text>
        <Pressable style={s.primary} onPress={exportBackup}>
          <Text style={s.primaryText}>{c.export}</Text>
        </Pressable>
        <Pressable style={s.outlineInline} onPress={importBackup}>
          <Text style={s.outlineText}>{c.restore}</Text>
        </Pressable>
      </View>
      <Pressable style={s.outline} onPress={() => void logout()}>
        <Text style={s.outlineText}>{c.logout}</Text>
      </Pressable>
    </View>
  );
}

function Profile({
  t,
  lang,
  setLang,
  activeRole,
  changeRole,
}: {
  t: UiCopy;
  lang: Lang;
  setLang: (v: Lang) => void;
  activeRole?: (typeof roles)[number];
  changeRole: () => void;
}) {
  return (
    <View>
      <Text style={s.h1}>{t.profile}</Text>
      <View style={s.card}>
        <Text style={s.label}>{t.role}</Text>
        <Text style={s.cardTitle}>{activeRole?.[lang]}</Text>
        <Text style={s.muted}>{activeRole?.scope[lang]}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.label}>{t.language}</Text>
        <View style={s.switcher}>
          {(["ru", "uz", "en"] as Lang[]).map((x) => (
            <Pressable
              key={x}
              style={[s.switchBtn, lang === x && s.switchActive]}
              onPress={() => setLang(x)}
            >
              <Text style={lang === x ? s.switchTextActive : s.switchText}>
                {x.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable style={s.outline} onPress={changeRole}>
        <Text style={s.outlineText}>{t.changeRole}</Text>
      </Pressable>
    </View>
  );
}
function Metric({
  value,
  label,
  bad,
}: {
  value: string;
  label: string;
  bad?: boolean;
}) {
  return (
    <View style={s.metric}>
      <Text style={[s.metricValue, bad && s.bad]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}
function Line({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={s.muted}>{k}</Text>
      <Text style={[s.lineValue, bad && s.bad]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f5f1" },
  loginWrap: { flex: 1, justifyContent: "center", padding: 24, gap: 14 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#e1e4df",
  },
  headerRight: { flexDirection: "row", gap: 7, alignItems: "center" },
  bell: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dbe0dc", alignItems: "center", justifyContent: "center" },
  bellText: { color: "#135f4b", fontSize: 16, fontWeight: "900" },
  badge: { position: "absolute", right: -5, top: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: "#b63b32", color: "#fff", fontSize: 9, fontWeight: "900", textAlign: "center", lineHeight: 17 },
  brand: { color: "#135f4b", fontWeight: "900", fontSize: 18 },
  brandBig: { color: "#135f4b", fontWeight: "900", fontSize: 22 },
  roleText: { color: "#707a75", fontSize: 11, marginTop: 2 },
  lang: {
    backgroundColor: "#fff",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#dbe0dc",
  },
  langText: { fontWeight: "800", fontSize: 11, color: "#135f4b" },
  connection: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    fontSize: 10,
    fontWeight: "800",
  },
  ok: { backgroundColor: "#dcefe7", color: "#135f4b" },
  warn: { backgroundColor: "#f8e4d0", color: "#98491c" },
  content: { padding: 14, paddingBottom: 30 },
  bottom: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#dde1de",
    paddingBottom: 5,
  },
  nav: { flex: 1, alignItems: "center", paddingVertical: 7 },
  navIcon: { fontSize: 16, color: "#8a938f" },
  navText: { fontSize: 8, color: "#8a938f", marginTop: 2 },
  navActive: { color: "#135f4b", fontWeight: "800" },
  loginHead: {
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  login: { padding: 18, paddingTop: 5 },
  h1: { fontSize: 24, fontWeight: "900", color: "#17211d", marginBottom: 7 },
  eyebrow: {
    color: "#135f4b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  muted: { color: "#707a75", fontSize: 12, lineHeight: 17 },
  noticeDanger: { borderLeftWidth: 4, borderLeftColor: "#b63b32" },
  noticeWarning: { borderLeftWidth: 4, borderLeftColor: "#d18a25" },
  noticeInfo: { borderLeftWidth: 4, borderLeftColor: "#168167" },
  roleCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e0e4e1",
    padding: 13,
    marginTop: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#dcefe7",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "900", fontSize: 12, color: "#135f4b" },
  cardTitle: {
    fontWeight: "800",
    fontSize: 15,
    color: "#202925",
    marginBottom: 3,
  },
  chevron: { fontSize: 28, color: "#a7afab" },
  switcher: {
    flexDirection: "row",
    backgroundColor: "#e5e8e5",
    borderRadius: 9,
    padding: 2,
  },
  switchBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7 },
  switchActive: { backgroundColor: "#135f4b" },
  switchText: { fontWeight: "800", fontSize: 11, color: "#69736f" },
  switchTextActive: { fontWeight: "800", fontSize: 11, color: "#fff" },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 15,
  },
  metric: {
    width: "48%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e4e1",
    borderRadius: 13,
    padding: 13,
  },
  metricValue: { fontWeight: "900", fontSize: 23, color: "#17211d" },
  metricLabel: { fontSize: 11, color: "#707a75", marginTop: 3 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  quickAction: {
    width: "48%",
    minHeight: 82,
    backgroundColor: "#e8f3ee",
    borderWidth: 1,
    borderColor: "#b9d8cc",
    borderRadius: 13,
    padding: 12,
    justifyContent: "center",
  },
  quickIcon: { fontSize: 22, color: "#135f4b", marginBottom: 6 },
  quickText: { color: "#135f4b", fontWeight: "900", fontSize: 13 },
  bad: { color: "#bb3f34" },
  section: {
    fontWeight: "900",
    fontSize: 16,
    color: "#202925",
    marginBottom: 8,
    marginTop: 6,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e0e4e1",
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  risk: {
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
  },
  riskHigh: { backgroundColor: "#f8dfdc", color: "#b63b32" },
  riskMid: { backgroundColor: "#f8ead0", color: "#9a631d" },
  riskLow: { backgroundColor: "#dcefe7", color: "#135f4b" },
  progressBg: {
    height: 7,
    borderRadius: 5,
    backgroundColor: "#e6e9e6",
    overflow: "hidden",
    marginVertical: 11,
  },
  progressFill: { height: 7, backgroundColor: "#168167", borderRadius: 5 },
  link: { color: "#135f4b", fontWeight: "800", marginBottom: 12 },
  hero: {
    backgroundColor: "#123e33",
    borderRadius: 16,
    padding: 18,
    marginVertical: 16,
  },
  heroValue: { color: "#fff", fontSize: 36, fontWeight: "900" },
  heroLabel: { color: "#bdd8cf", fontSize: 12 },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: "#ecefec",
  },
  lineValue: {
    fontWeight: "800",
    color: "#202925",
    maxWidth: "58%",
    textAlign: "right",
  },
  status: {
    color: "#135f4b",
    fontWeight: "800",
    fontSize: 11,
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    color: "#8a938f",
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  outline: {
    borderWidth: 1,
    borderColor: "#135f4b",
    borderRadius: 12,
    padding: 13,
    alignItems: "center",
  },
  outlineInline: {
    borderWidth: 1,
    borderColor: "#135f4b",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginTop: 10,
  },
  outlineText: { color: "#135f4b", fontWeight: "900" },
  filters: { marginVertical: 10 },
  filter: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "#e5e8e5",
    borderRadius: 10,
    marginRight: 7,
  },
  filterActive: { backgroundColor: "#135f4b" },
  filterText: { fontSize: 11, fontWeight: "800", color: "#69736f" },
  filterTextActive: { fontSize: 11, fontWeight: "800", color: "#fff" },
  priority: {
    fontSize: 9,
    fontWeight: "900",
    color: "#59635f",
    backgroundColor: "#edf0ed",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    marginBottom: 8,
  },
  priorityHigh: { backgroundColor: "#f8dfdc", color: "#b63b32" },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    padding: 13,
    borderRadius: 12,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: "#e0e4e1",
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#a9b1ad",
    textAlign: "center",
    lineHeight: 20,
    fontWeight: "900",
    color: "#fff",
  },
  checkDone: { backgroundColor: "#168167", borderColor: "#168167" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  signaturePad: { height: 130, backgroundColor: "#f8faf8", borderWidth: 1, borderColor: "#cfd7d2", borderRadius: 10, overflow: "hidden", marginVertical: 8 },
  signatureDot: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: "#17211d" },
  signatureHint: { color: "#9aa39f", textAlign: "center", marginTop: 52 },
  strike: { textDecorationLine: "line-through", color: "#8a938f" },
  primary: {
    backgroundColor: "#135f4b",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#fff", fontWeight: "900" },
  queue: { fontSize: 11, color: "#707a75", textAlign: "center", marginTop: 10 },
  photo: { width: "100%", height: 220, borderRadius: 10, marginBottom: 8, backgroundColor: "#eef1ee" },
  photoViewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)" },
  photoViewerScroll: { flex: 1 },
  photoViewerContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  photoViewerImage: { width: "100%", height: "100%" },
  photoViewerClose: { position: "absolute", zIndex: 2, right: 16, top: 42, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  photoViewerCloseText: { color: "#fff", fontSize: 34, lineHeight: 38 },
  geoCard: {
    backgroundColor: "#eef7f3",
    borderWidth: 1,
    borderColor: "#b9d8cc",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  geoTitle: { color: "#135f4b", fontWeight: "900", fontSize: 14 },
  geoAddress: { color: "#46504c", lineHeight: 19, marginTop: 5 },
  geoButton: {
    backgroundColor: "#135f4b",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    marginTop: 10,
  },
  geoButtonText: { color: "#fff", fontWeight: "900" },
  disabled: { opacity: 0.45 },
  actionRow: { flexDirection: "row", gap: 8 },
  action: { flex: 1 },
  danger: {
    borderWidth: 1,
    borderColor: "#b63b32",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 8,
  },
  dangerText: { color: "#b63b32", fontWeight: "900" },
  note: {
    backgroundColor: "#eef1ef",
    padding: 12,
    borderRadius: 10,
    color: "#46504c",
    marginTop: 10,
  },
  beforeAfter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  defectPhoto: { width: "100%", height: 180, borderRadius: 8, marginTop: 8, backgroundColor: "#eef1ee" },
  timeline: {
    backgroundColor: "#fff",
    borderLeftWidth: 3,
    borderLeftColor: "#168167",
    padding: 10,
    marginBottom: 5,
    color: "#46504c",
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#e5e8e5",
    borderRadius: 11,
    padding: 3,
    marginVertical: 10,
  },
  segmentBtn: { flex: 1, padding: 9, alignItems: "center", borderRadius: 9 },
  segmentActive: { backgroundColor: "#135f4b" },
  segmentText: { fontSize: 11, fontWeight: "800", color: "#69736f" },
  segmentTextActive: { fontSize: 11, fontWeight: "800", color: "#fff" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dce1dd",
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  dateBlock: { marginBottom: 8 },
  dateRow: { flexDirection: "row", alignItems: "center" },
  datePart: {
    width: 64,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dce1dd",
    borderRadius: 12,
    paddingVertical: 12,
    textAlign: "center",
    fontSize: 17,
  },
  dateYear: { width: 88 },
  dateDot: { paddingHorizontal: 6, fontSize: 22, fontWeight: "700", color: "#69736f" },
  field: {
    backgroundColor: "#f7f8f6",
    borderWidth: 1,
    borderColor: "#dce1dd",
    borderRadius: 10,
    padding: 11,
    marginTop: 8,
  },
  search: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce1dd", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 10 },
  compose: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  miniBtn: { padding: 8 },
  primarySmall: {
    backgroundColor: "#135f4b",
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  thread: { marginLeft: 20, borderLeftWidth: 3, borderLeftColor: "#168167" },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: "#26302c",
    marginVertical: 6,
  },
  attachment: { color: "#135f4b", fontWeight: "800", marginVertical: 7 },
  recording: { backgroundColor: "#b63b32" },
  version: {
    backgroundColor: "#dcefe7",
    color: "#135f4b",
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  scannerWrap: {
    height: 330,
    borderRadius: 14,
    overflow: "hidden",
    marginVertical: 10,
    backgroundColor: "#111",
  },
  scanner: { flex: 1 },
  scannerText: {
    position: "absolute",
    bottom: 14,
    left: 20,
    right: 20,
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
    backgroundColor: "#0009",
    padding: 10,
    borderRadius: 8,
  },
  toolFound: {
    backgroundColor: "#e6f2ed",
    borderWidth: 1,
    borderColor: "#b9d8cc",
    borderRadius: 14,
    padding: 14,
    marginVertical: 10,
  },
});
