export type Language = "en" | "zh";

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  zh: "中文",
};

export const STEP_TITLES: Record<
  "welcome" | "download" | "install" | "configure" | "gateway" | "skills" | "done",
  Record<Language, string>
> = {
  welcome: {
    en: "Welcome",
    zh: "欢迎",
  },
  download: {
    en: "Download",
    zh: "下载",
  },
  install: {
    en: "Install",
    zh: "安装",
  },
  configure: {
    en: "Configure",
    zh: "配置",
  },
  gateway: {
    en: "Gateway",
    zh: "网关",
  },
  skills: {
    en: "Skills & Tools",
    zh: "技能与工具",
  },
  done: {
    en: "Done",
    zh: "完成",
  },
};

export const TEXT = {
  appTitle: {
    en: "OpenClaw Desktop Wizard",
    zh: "OpenClaw 桌面向导",
  },
  // Step navigation aria label
  stepNumber: {
    en: (index: number) => `Step ${index}`,
    zh: (index: number) => `步骤 ${index}`,
  },
} as const;

