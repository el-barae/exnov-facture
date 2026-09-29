import Image from "next/image";
import { APP_NAME } from "@/config/app";

export function WorkspaceLoading() {
  return <main className="workspace-loading" aria-busy="true">
    <div className="workspace-loading-card">
      <div className="workspace-loading-mark" aria-hidden="true">
        <Image src="/logo.png" alt="" width={229} height={172} priority unoptimized/>
      </div>
      <p className="workspace-loading-brand">{APP_NAME}</p>
      <h1 role="status" aria-live="polite">Chargement de votre espace…</h1>
      <p className="workspace-loading-description">Vos projets et votre équipe, au même endroit.</p>
      <div className="workspace-loading-track" aria-hidden="true"><span/></div>
      <span className="workspace-loading-caption">Un instant, nous préparons votre espace.</span>
    </div>
  </main>;
}
