export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "exnov.theme.v1";

// Exécuté avant l’affichage pour appliquer le choix sans flash du thème clair.
export const THEME_INIT_SCRIPT = `(function(){var theme;try{theme=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}document.documentElement.dataset.theme=theme==="light"||theme==="dark"?theme:window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"})()`;
