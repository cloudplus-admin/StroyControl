export type Tab =
  | "home"
  | "objects"
  | "tasks"
  | "quality"
  | "feed"
  | "supply"
  | "profile";

export type NotificationTarget =
  | { screen: "task"; id: string }
  | { screen: "material"; id: string }
  | { screen: "quality"; id: string }
  | { screen: "document"; id: string }
  | { screen: "act"; id: string };

export function tabForNotification(target: NotificationTarget): Tab {
  if (target.screen === "task") return "tasks";
  if (target.screen === "quality") return "quality";
  if (target.screen === "document" || target.screen === "act") return "feed";
  return "supply";
}
