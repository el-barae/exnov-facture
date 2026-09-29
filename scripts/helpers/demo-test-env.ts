// Les anciens tests d’export valident le contenu sans ouvrir de sessions réelles.
// Le parcours test:team exerce séparément les routes avec authentification active.
process.env.EXNOV_DEMO_MODE = "true";
