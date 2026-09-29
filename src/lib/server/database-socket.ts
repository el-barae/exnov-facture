import "server-only";
import { Socket, type SocketConnectOpts } from "node:net";

/** Donne aux adresses PostgreSQL distantes le temps de répondre avant d’essayer la suivante. */
export class DatabaseSocket extends Socket {
  override connect(options: SocketConnectOpts, listener?: () => void): this;
  override connect(port: number, host: string, listener?: () => void): this;
  override connect(port: number, listener?: () => void): this;
  override connect(path: string, listener?: () => void): this;
  override connect(target: SocketConnectOpts | number | string, hostOrListener?: string | (() => void), listener?: () => void): this {
    const callback = typeof hostOrListener === "function" ? hostOrListener : listener;
    if (typeof target === "string") return super.connect(target, callback);
    const options: SocketConnectOpts = typeof target === "number"
      ? { port: target, host: typeof hostOrListener === "string" ? hostOrListener : "localhost" }
      : target;
    if (!("port" in options)) return super.connect(options, callback);
    return super.connect({
      ...options,
      // Node 22 attend seulement 250 ms par adresse par défaut, indépendamment
      // du délai global du pool. Une latence réseau variable peut alors épuiser
      // toutes les adresses IPv4 avant les 10 s prévues pour la connexion.
      autoSelectFamilyAttemptTimeout: options.autoSelectFamilyAttemptTimeout ?? 1000,
    }, callback);
  }
}
