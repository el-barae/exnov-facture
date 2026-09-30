"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BookOpen, FileText, FolderKanban, LogOut, PencilRuler, Sparkles } from "lucide-react";
import { TeamProvider, useTeam } from "./TeamProvider";
import { WorkspaceLoading } from "./WorkspaceLoading";
import { canManageProjects, canUseAi, type TeamUser } from "@/lib/team";
import { AtelierFacture, type AtelierFactureHandle } from "./AtelierFacture";
import { AtelierRapport } from "./AtelierRapport";
import { EspaceProjets, type ProjectGenerator } from "./EspaceProjets";
import { AtelierCps } from "./AtelierCps";
import { AtelierPlan } from "./AtelierPlan";
import { Connexion } from "./Connexion";
import { ThemeToggle } from "./ThemeToggle";
import { ProjectWorkspace, type WorkshopDraft } from "./ProjectWorkspace";
import { projectPlanContent } from "@/lib/cad/project-draft";
import { loadProjectPlan } from "@/lib/project-storage";
import type { LoadedProjectPlan } from "@/lib/cad/project";
import type { CadPlan } from "@/lib/cad/types";
import type { CivilProject } from "@/lib/projects";

type Service = "factures" | "rapports" | "projets" | "cps" | "plans";

function allowedService(service: Service, user: TeamUser | null): Service {
  if (service === "factures" && !canManageProjects(user)) return "projets";
  if ((service === "rapports" || service === "cps") && !canUseAi(user)) return "projets";
  return service;
}

function currentService(): Service {
  if (window.location.pathname === "/plans") return "plans";
  if (window.location.pathname === "/cps") return "cps";
  if (window.location.pathname === "/projets") return "projets";
  const requested = new URLSearchParams(window.location.search).get("service");
  return requested === "rapports" || requested === "factures" ? requested : "projets";
}

export function EspaceExnov() {
  return <TeamProvider><TeamGate/></TeamProvider>;
}

function TeamGate() {
  const { user, mode, loading, error, refreshSession, login } = useTeam();
  if (loading) return <WorkspaceLoading/>;
  if (error && !user) return <main className="login-loading team-setup"><h1>Connexion indisponible</h1><p role="alert">{error}</p><button type="button" className="primary-button" onClick={() => void refreshSession().catch(() => {})}>Réessayer</button></main>;
  if (mode === "setup") return <main className="login-loading team-setup"><h1>Préparer l’espace équipe</h1><p>L’administrateur doit configurer la connexion et le stockage partagé avant d’ouvrir cet espace.</p><button type="button" className="secondary-button" onClick={() => void refreshSession().catch(() => {})}>Vérifier la configuration</button></main>;
  if (!user) return <Connexion mode={mode} onLogin={async (email, password) => {
    window.history.replaceState(null, "", "/projets");
    await login(email, password);
  }}/>;
  return <>
    {error && <main className="login-loading team-setup"><h1>Connexion indisponible</h1><p role="alert">{error}</p><p>Vos brouillons restent ouverts pendant la reconnexion.</p><button type="button" className="primary-button" onClick={() => void refreshSession().catch(() => {})}>Réessayer</button></main>}
    <div hidden={!!error}><EspaceConnecte key={user.id} initialService={allowedService(currentService(), user)}/></div>
  </>;
}

function EspaceConnecte({ initialService }: { initialService: Service }) {
  const { user, logout } = useTeam();
  const email = user!.email;
  const manageProjects = canManageProjects(user);
  const useAi = canUseAi(user);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const invoiceEditor = useRef<AtelierFactureHandle>(null);
  const [contexts, setContexts] = useState<Partial<Record<Service, CivilProject>>>({});
  const [projectToOpen, setProjectToOpen] = useState<{ id: string; request: number } | null>(null);
  const [planDocument, setPlanDocument] = useState<LoadedProjectPlan>();
  const [planSession, setPlanSession] = useState(0);
  const [planOpening, setPlanOpening] = useState(false);
  const [planOpenError, setPlanOpenError] = useState("");
  const planRequest = useRef(0);
  const activePlanKey = useRef("");
  const activeService = useRef(initialService);
  const activePlanSession = useRef(0);
  const planNavigation = useRef(false);
  const [drafts] = useState(() => new Map<string, WorkshopDraft>());
  const plansKey = `plans:${contexts.plans?.id ?? "standalone"}:${planDocument?.source.documentId ?? "draft"}`;
  function draftFor(name: Service) {
    const key = name === "plans" ? plansKey : `${name}:${contexts[name]?.id ?? "standalone"}`;
    if (!drafts.has(key)) drafts.set(key, new Map());
    return drafts.get(key)!;
  }
  function openProject(id: string) {
    setProjectToOpen(previous => ({ id, request: (previous?.request ?? 0) + 1 }));
    select("projets");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const [requestedService, setService] = useState<Service>(initialService);
  const service = allowedService(requestedService, user);
  const [reportsVisited, setReportsVisited] = useState(initialService === "rapports");
  const [projectsVisited, setProjectsVisited] = useState(initialService === "projets");
  const [cpsVisited, setCpsVisited] = useState(initialService === "cps");
  const [plansVisited, setPlansVisited] = useState(initialService === "plans");
  useEffect(() => { activePlanKey.current = plansKey; activeService.current = service; activePlanSession.current = planSession; }, [plansKey, service, planSession]);
  function planUrl(document = planDocument) {
    return document ? `/plans?project=${encodeURIComponent(document.source.projectId)}&document=${encodeURIComponent(document.source.documentId)}` : "/plans";
  }
  function openPlanDocument(document: LoadedProjectPlan, navigate = true) {
    planNavigation.current = false;
    const key = `plans:${document.source.projectId}:${document.source.documentId}`;
    const draft = drafts.get(key);
    const history = draft?.get("history") as { present: CadPlan } | undefined;
    if (history) {
      const content = projectPlanContent(history.present);
      // Refresh a clean draft; retain unsaved edits and their original revision for conflict checks.
      if (content === draft?.get("projectPlanSavedContent")) drafts.delete(key);
    }
    setContexts(previous => ({ ...previous, plans: document.project }));
    setPlanSession(previous => previous + 1);
    setPlanDocument(document); setPlanOpenError(""); setPlanOpening(false); setPlansVisited(true);
    if (navigate) {
      planRequest.current += 1;
      setService("plans");
      window.history.pushState(null, "", planUrl(document));
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  function openPlanDraft(plan: CadPlan) {
    planNavigation.current = false;
    planRequest.current += 1;
    const key = `plans:${contexts.plans?.id ?? "standalone"}:draft`;
    const draft = new Map<string, unknown>();
    const independent = plan.id.startsWith("project:") ? { ...plan, id: crypto.randomUUID() } : plan;
    draft.set("history", { past: [], present: independent, future: [] });
    drafts.set(key, draft);
    setPlanSession(previous => previous + 1);
    setPlanDocument(undefined); setPlanOpenError(""); setPlanOpening(false);
    if (activeService.current === "plans") window.history.pushState(null, "", "/plans");
  }
  function planSaved(document: LoadedProjectPlan, originKey: string, originDraft: WorkshopDraft, originSession: number) {
    const key = `plans:${document.source.projectId}:${document.source.documentId}`;
    const stillCurrent = activePlanKey.current === originKey && drafts.get(originKey) === originDraft;
    const existing = drafts.get(key);
    if (!existing || existing === originDraft) drafts.set(key, originDraft);
    if (originKey !== key && drafts.get(originKey) === originDraft) drafts.delete(originKey);
    // Both the document and the draft must match: a new plan can reuse the generic workspace key.
    if (!stillCurrent || planNavigation.current) return;
    if (activePlanSession.current !== originSession) setPlanSession(previous => previous + 1);
    setContexts(previous => ({ ...previous, plans: document.project }));
    setPlanDocument(document);
    if (activeService.current === "plans") window.history.replaceState(null, "", planUrl(document));
  }
  useEffect(() => {
    const restore = () => {
      const next = currentService();
      if (next === "rapports") setReportsVisited(true);
      if (next === "projets") setProjectsVisited(true);
      if (next === "cps") setCpsVisited(true);
      if (next === "plans") setPlansVisited(true);
      setService(next);
      const request = ++planRequest.current;
      planNavigation.current = false;
      const params = new URLSearchParams(window.location.search);
      const projectId = params.get("project"), documentId = params.get("document");
      if (next === "plans" && projectId && documentId) {
        planNavigation.current = true;
        setPlanOpening(true); setPlanOpenError("");
        void loadProjectPlan(projectId, documentId).then(document => {
          if (planRequest.current === request) openPlanDocument(document, false);
        }).catch(reason => {
          if (planRequest.current === request) { planNavigation.current = false; setPlanOpening(false); setPlanOpenError(reason instanceof Error ? reason.message : "Impossible d’ouvrir ce plan."); }
        });
      } else if (next === "plans") { setPlanDocument(undefined); setContexts(previous => ({ ...previous, plans: undefined })); setPlanOpening(false); setPlanOpenError(""); }
    };
    // Restaurer le service depuis l’URL après hydratation et lors des retours navigateur.
    void Promise.resolve().then(restore);
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
    // Navigation is restored from the URL; draft maps are stable for this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function select(requested: Service) {
    const next = allowedService(requested, user);
    planNavigation.current = false;
    planRequest.current += 1;
    setPlanOpening(false);
    if (next === "rapports") setReportsVisited(true);
    if (next === "projets") setProjectsVisited(true);
    if (next === "cps") setCpsVisited(true);
    if (next === "plans") setPlansVisited(true);
    setService(next);
    const url = next === "plans" ? planUrl() : next === "cps" ? "/cps" : next === "projets" ? "/projets" : `/?service=${next}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState(null, "", url);
  }
  function openProjectGenerator(kind: ProjectGenerator, project: CivilProject) {
    if ((kind === "devis" || kind === "facture") && !manageProjects) return;
    if ((kind === "rapport" || kind === "cps") && !useAi) return;
    if (kind === "devis" || kind === "facture") {
      invoiceEditor.current?.selectDocumentType(kind);
      select("factures");
    } else if (kind === "plans") {
      setContexts(previous => ({ ...previous, plans: project }));
      setPlanDocument(undefined); setPlanOpenError("");
      select("plans");
      window.history.replaceState(null, "", "/plans");
    } else select(kind === "rapport" ? "rapports" : "cps");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const plansDraft = draftFor("plans");
  return <>
    <header className="app-header">
      <div className="header-inner">
        <button type="button" className="brand-lockup" aria-label="EXNOV — Accueil" onClick={() => select("projets")}>
          <Image className="header-logo" src="/logo.png" alt="EXNOV" width={229} height={172} priority unoptimized/>
        </button>
        <div className="header-divider"/>
        <nav className="service-switch" aria-label="Services EXNOV">
          <button type="button" aria-pressed={service === "projets"} onClick={() => select("projets")}><FolderKanban size={15}/><span>Projets</span></button>
          {manageProjects && <button type="button" aria-pressed={service === "factures"} onClick={() => select("factures")}><FileText size={15}/><span>Factures / Devis</span></button>}
          {useAi && <button type="button" aria-pressed={service === "rapports"} onClick={() => select("rapports")}><Sparkles size={15}/><span>Rapports IA</span></button>}
          {useAi && <button type="button" aria-pressed={service === "cps"} onClick={() => select("cps")}><BookOpen size={15}/><span>CPS IA</span></button>}
          <button type="button" aria-pressed={service === "plans"} onClick={() => select("plans")}><PencilRuler size={15}/><span>Plans 2D</span></button>
        </nav>
        <div className="header-account"><span className="company-location">Tanger, Maroc</span><ThemeToggle/><span className="avatar" title={email} aria-label={`Connecté : ${email}`}>{email.slice(0, 2).toUpperCase()}</span><button type="button" className="icon-button logout-button" aria-label="Se déconnecter" title="Se déconnecter" disabled={loggingOut} onClick={async () => {
          setLoggingOut(true); setLogoutError("");
          try { await logout(); window.history.replaceState(null, "", "/"); }
          catch (reason) { setLogoutError(reason instanceof Error ? reason.message : "La déconnexion a échoué."); setLoggingOut(false); }
        }}><LogOut size={18}/></button></div>
      </div>
    </header>
    {logoutError && <p className="project-error team-session-error" role="alert">{logoutError}</p>}
    {manageProjects && <div hidden={service !== "factures"}><AtelierFacture ref={invoiceEditor}/></div>}
    {useAi && reportsVisited && <div hidden={service !== "rapports"}><AtelierRapport/></div>}
    {(projectsVisited || service === "projets") && <div hidden={service !== "projets"}><EspaceProjets onOpenPlan={openPlanDocument} onOpenGenerator={openProjectGenerator} projectToOpen={projectToOpen}/></div>}
    {plansVisited && <div hidden={service !== "plans"}>{planOpening ? <main className="plans-workspace" role="status">Ouverture du plan du projet…</main> : planOpenError ? <main className="plans-workspace"><p className="plans-error" role="alert">{planOpenError}</p><button type="button" className="secondary-button" onClick={() => select("projets")}>Retour aux projets</button></main> : <ProjectWorkspace key={`${plansKey}:${planSession}`} project={contexts.plans} draft={plansDraft} planDocument={planDocument} onOpenPlanDraft={openPlanDraft} onPlanSaved={document => planSaved(document, plansKey, plansDraft, planSession)} onOpenProject={openProject} onLeaveProject={() => { setContexts(previous => ({ ...previous, plans: undefined })); setPlanDocument(undefined); window.history.replaceState(null, "", "/plans"); }}><AtelierPlan/></ProjectWorkspace>}</div>}
    {useAi && cpsVisited && <div hidden={service !== "cps"}><AtelierCps/></div>}
  </>;
}
