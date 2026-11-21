import { useEffect, useMemo, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITDialog, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { LuCheck, LuCopy, LuQrCode, LuRefreshCw, LuSmartphone } from "react-icons/lu";
import QRCode from "qrcode";
import {
  activationApiUrl,
  agoText,
  issueDevice,
  qrPayload,
  rotateDeviceCode,
  type ClientDetail,
  type Device,
  type IssuedDevice,
} from "../api";
import { errorOf } from "../shared";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  client: Pick<ClientDetail, "id" | "name" | "phone" | "product">;
  /** Si se pasa, el QR rota el código de ese dispositivo en vez de crear uno. */
  device?: Device | null;
  /** Recarga el cliente para que la lista de licencias refleje el alta. */
  onIssued: () => void | Promise<void>;
}

const DEFAULT_DEVICE = "Tablet de cocina";

/**
 * Flujo de activación por QR: pide el nombre del dispositivo, genera (o rota)
 * el código, arma el payload compacto del contrato §6.1 y lo dibuja con `qrcode`.
 * El código y la imagen se limpian al cerrar: solo se muestran una vez.
 */
export default function QrActivationDialog({ isOpen, onClose, client, device = null, onIssued }: Props) {
  const [deviceName, setDeviceName] = useState(DEFAULT_DEVICE);
  const [issued, setIssued] = useState<IssuedDevice | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // Cada apertura empieza de cero: el código nunca se reutiliza de una sesión previa.
  useEffect(() => {
    if (!isOpen) return;
    setIssued(null);
    setQr(null);
    setCopied(false);
    setError("");
    setDeviceName(device?.name ?? DEFAULT_DEVICE);
  }, [isOpen, device?.id, device?.name]);

  const close = () => {
    setIssued(null);
    setQr(null);
    setCopied(false);
    setError("");
    onClose();
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const name = deviceName.trim() || DEFAULT_DEVICE;
      const result = device ? await rotateDeviceCode(client.id, device.id) : await issueDevice(client.id, name);
      const apiUrl = await activationApiUrl();
      const image = await QRCode.toDataURL(qrPayload(apiUrl, result.code, client.product.key), {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 400,
        color: { dark: "#1D2636", light: "#FFFFFF" },
      });
      setIssued(result);
      setQr(image);
      await onIssued();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
    } catch {
      setError("No se pudo copiar automáticamente. Selecciona el código de la caja y cópialo a mano.");
    }
  };

  const whatsapp = useMemo(() => {
    if (!issued || !client.phone) return null;
    const digits = client.phone.replace(/\D/g, "");
    if (!digits) return null;
    const phone = digits.length === 10 ? `52${digits}` : digits;
    const message =
      `Hola ${client.name}, este es el código de activación de Axzy Cocina:\n\n` +
      `${issued.code}\n\n` +
      `En la tablet: instala la app, abre «Cocina» y elige «Escanear QR de la Central» ` +
      `(también puedes escribir el código a mano). El código se puede usar una sola vez.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }, [client.phone, client.name, issued]);

  const title = device ? "Nuevo QR de activación" : "QR de activación";

  return (
    <ITDialog isOpen={isOpen} onClose={close} title={title} className="w-[min(94vw,460px)] max-h-[92dvh] overflow-y-auto">
      {!issued ? (
        <div className="flex flex-col gap-4">
          <ITText muted className="text-sm">
            La tablet de cocina se activa escaneando este QR con la app instalada. El código se genera en la Central y
            se muestra una sola vez.
          </ITText>

          {device ? (
            <>
              <div className="rounded-2xl bg-[var(--it-bento-control-bg,#f1f5f9)] p-3">
                <p className="text-sm font-semibold">{device.name}</p>
                <p className="text-xs text-axzy-slate dark:text-axzy-mist">
                  {device.activatedAt ? "Ya activada" : "Sin activar"} · Última conexión: {agoText(device.lastSeenAt)}
                </p>
              </div>
              <ITAlert variant="warning">
                Al generar el nuevo QR, el código anterior de <strong>{device.name}</strong> dejará de funcionar. La app
                seguirá activa; solo cambia la llave por si hay que reinstalarla.
              </ITAlert>
            </>
          ) : (
            <ITInput
              name="deviceName"
              label="Nombre del dispositivo"
              value={deviceName}
              maxLength={60}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={DEFAULT_DEVICE}
            />
          )}

          {error && <ITAlert variant="error">{error}</ITAlert>}

          <div className="flex flex-wrap justify-end gap-2">
            <ITButton variant="outlined" color="gray" onClick={close}>
              Cancelar
            </ITButton>
            <ITButton icon={device ? <LuRefreshCw size={14} /> : <LuQrCode size={15} />} onClick={() => void generate()} disabled={busy}>
              {busy ? "Generando…" : "Generar QR"}
            </ITButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ITAlert variant="warning" title="Guarda este QR ahora">
            El código se muestra una sola vez. Si cierras esta ventana sin usarlo, tendrás que generar uno nuevo.
          </ITAlert>

          <div className="text-center">
            <p className="text-sm font-semibold">{issued.device.name}</p>
            <p className="text-xs text-axzy-slate dark:text-axzy-mist">Para {client.name}</p>
          </div>

          {qr && (
            <div className="mx-auto w-fit rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5">
              <img src={qr} alt={`QR de activación de ${client.name}`} className="h-52 w-52 sm:h-60 sm:w-60" />
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="axc-eyebrow text-axzy-slate dark:text-axzy-mist">Respaldo del código</p>
              <ITBadget color="warning" size="sm" label="Solo se muestra una vez" />
            </div>
            <code className="block select-all break-all rounded-xl bg-[var(--it-bento-control-bg,#f1f5f9)] px-3 py-2 font-mono text-sm">
              {issued.code}
            </code>
          </div>

          <ol className="flex list-none flex-col gap-2 p-0 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                1
              </span>
              <span>Instala la app de Cocina en la tablet.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                2
              </span>
              <span>Abre la app y elige el modo «Cocina».</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                3
              </span>
              <span>Toca «Escanear QR de la Central» y apunta la cámara a este código.</span>
            </li>
          </ol>

          <ITText muted className="flex items-start gap-1.5 text-xs">
            <LuSmartphone aria-hidden className="mt-0.5 shrink-0" size={13} />
            Si la cámara no funciona, escribe el código a mano en la app: el respaldo de texto sigue sirviendo.
          </ITText>

          {error && <ITAlert variant="error">{error}</ITAlert>}

          <div className="flex flex-wrap gap-2">
            <ITButton
              variant="outlined"
              size="sm"
              icon={copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
              onClick={() => void copy()}
            >
              {copied ? "Código copiado" : "Copiar código"}
            </ITButton>
            {whatsapp ? (
              <ITButton
                size="sm"
                color="success"
                variant="outlined"
                onClick={() => window.open(whatsapp, "_blank", "noopener,noreferrer")}
              >
                Enviar por WhatsApp
              </ITButton>
            ) : (
              <ITButton size="sm" variant="text" color="gray" disabled title="Agrega un teléfono al cliente para enviárselo">
                Sin teléfono para WhatsApp
              </ITButton>
            )}
            <ITButton size="sm" className="ml-auto" onClick={close}>
              Listo
            </ITButton>
          </div>
        </div>
      )}
    </ITDialog>
  );
}
