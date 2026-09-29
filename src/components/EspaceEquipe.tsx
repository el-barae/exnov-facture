"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { canManageTeam, TEAM_ROLE_LABELS, teamRoleSchema, type TeamRole, type TeamUser } from "@/lib/team";
import { teamRequest } from "@/lib/team-client";
import { useTeam } from "./TeamProvider";

export function EspaceEquipe() {
  const { user, refreshSession } = useTeam();
  const canManage = canManageTeam(user);
  const [members, setMembers] = useState<TeamUser[]>([]);
  const [ready, setReady] = useState(false);
  const requestVersion = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const request = ++requestVersion.current;
    try {
      const result = await teamRequest<{ users: TeamUser[] }>("/api/team/members");
      if (request !== requestVersion.current) return;
      setMembers(result.users); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de charger l’équipe."); }
    finally { setReady(true); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canManage) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    requestVersion.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await teamRequest<{ user: TeamUser }>("/api/team/members", { method: "POST", body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), role: data.get("role") }) });
      setMembers(previous => [...previous, result.user]); form.reset(); setShowForm(false);
      setNotice(`Compte créé pour ${result.user.name}. Transmettez-lui ses identifiants par votre canal habituel.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de créer ce compte."); }
    finally { requestVersion.current += 1; setBusy(false); }
  }
  async function updateMember(member: TeamUser, changes: { role?: TeamRole; active?: boolean; password?: string }) {
    if (busy || !canManage) return;
    requestVersion.current += 1;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await teamRequest<{ user: TeamUser }>(`/api/team/members/${encodeURIComponent(member.id)}`, { method: "PATCH", body: JSON.stringify(changes) });
      setMembers(previous => previous.map(value => value.id === member.id ? result.user : value));
      setPasswordFor(null); setNotice(`Compte de ${result.user.name} mis à jour.`);
      if (member.id === user?.id) await refreshSession();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de modifier ce compte."); }
    finally { requestVersion.current += 1; setBusy(false); }
  }
  return <main className="workspace team-workspace">
    <header className="page-heading"><div><div className="eyebrow"><span/> L’ESPACE PARTAGÉ</div><h1>Équipe</h1><p>{canManage ? "Gérez les comptes, les rôles et l’accès à l’IA." : "Retrouvez les collaborateurs disponibles pour vos projets."}</p></div><div className="team-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16}/> Actualiser</button>{canManage && <button className="primary-button" type="button" disabled={busy} onClick={() => setShowForm(value => !value)}><Plus size={16}/> Ajouter un membre</button>}</div></header>
    <p className="team-permission-note"><ShieldCheck size={18}/><span>Les gérants et chefs de projets créent les missions et affectent les tâches. Les techniciens travaillent sur les projets qui leur sont affectés. Le rôle Technicien Pro donne également accès à l’IA.</span></p>
    {error && <p className="project-error" role="alert">{error}</p>}
    {notice && <p className="project-success" role="status">{notice}</p>}
    {canManage && showForm && <form className="team-panel team-member-form" onSubmit={createMember}>
      <h2>Nouveau membre</h2>
      <div className="team-form-grid"><label className="field-label">Nom complet<input name="name" required maxLength={160} autoComplete="name" disabled={busy}/></label><label className="field-label">Adresse e-mail<input type="email" name="email" required maxLength={254} autoComplete="email" disabled={busy}/></label><label className="field-label">Rôle<select name="role" defaultValue="technician" disabled={busy}>{teamRoleSchema.options.map(role => <option key={role} value={role}>{TEAM_ROLE_LABELS[role]}</option>)}</select></label><label className="field-label">Mot de passe initial<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy}/><small>12 caractères minimum. À transmettre au collaborateur.</small></label></div>
      <div className="team-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => setShowForm(false)}>Annuler</button><button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Plus size={16}/>} Créer le compte</button></div>
    </form>}
    <section className="team-panel" aria-labelledby="team-members-title"><h2 id="team-members-title"><Users size={19}/> Collaborateurs <span className="projects-count">{members.length}</span></h2>
      {!ready ? <p role="status">Chargement de l’équipe…</p> : !members.length ? <p>Aucun membre disponible.</p> : <ul className="team-member-list">{members.map(member => <li key={member.id}>
        <div className="team-member-identity"><strong>{member.name}{member.id === user?.id ? " (vous)" : ""}</strong><span>{member.email}</span><small className={member.active ? "team-active" : "team-inactive"}>{member.active ? "Compte actif" : "Compte désactivé"}</small></div>
        {canManage ? <div className="team-member-controls"><label className="field-label"><span className="sr-only">Rôle de {member.name}</span><select value={member.role} disabled={busy} onChange={event => void updateMember(member, { role: event.target.value as TeamRole })}>{teamRoleSchema.options.map(role => <option key={role} value={role}>{TEAM_ROLE_LABELS[role]}</option>)}</select></label><button className="secondary-button" type="button" disabled={busy || member.id === user?.id} onClick={() => void updateMember(member, { active: !member.active })}>{member.active ? "Désactiver" : "Réactiver"}</button><button className="secondary-button" type="button" disabled={busy} aria-expanded={passwordFor === member.id} onClick={() => setPasswordFor(value => value === member.id ? null : member.id)}><KeyRound size={15}/> Mot de passe</button></div> : <span className="team-role-badge">{TEAM_ROLE_LABELS[member.role]}</span>}
        {canManage && passwordFor === member.id && <form className="team-password-form" onSubmit={event => { event.preventDefault(); const password = String(new FormData(event.currentTarget).get("password") ?? ""); void updateMember(member, { password }); }}><label className="field-label">Nouveau mot de passe pour {member.name}<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy}/></label><button className="primary-button" type="submit" disabled={busy}>Enregistrer le mot de passe</button></form>}
      </li>)}</ul>}
    </section>
  </main>;
}
