import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ITAlert,
  ITBadget,
  ITButton,
  ITCheckbox,
  ITChip,
  ITConfirmDialog,
  ITDialog,
  ITInput,
} from "@axzydev/axzy_ui_system";
import {
  LuCheck,
  LuCopy,
  LuKeyRound,
  LuMessageCircle,
  LuPencil,
  LuShieldCheck,
  LuShieldOff,
  LuUserPlus,
} from "react-icons/lu";
import {
  agoText,
  clientUserError,
  createClientUser,
  dateText,
  listClientUsers,
  listRoles,
  resetClientUserPassword,
  updateClientUser,
  type ClientDetail,
  type ClientUser,
  type ClientUserPatch,
  type CreatedClientUser,
  type NewClientUserBody,
  type Role,
} from "../api";
import { errorOf } from "../shared";
import { useNotify } from "../toast";
import { Card, Empty, IconAction, Initials, TableWrap, Td, Th } from "../ui";

/** Cliente mínimo que necesita la tarjeta: id, nombre, teléfono y producto. */
type ClientRef = Pick<ClientDetail, "id" | "name" | "phone" | "product">;

/** Regla de username del contrato §2 (el API normaliza y valida igual). */
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,39}$/;

/** Convierte un nombre en el candidato de username del contrato §2. */
const asUsername = (value: string) => {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(cleaned) ? cleaned : `u${cleaned}`.slice(0, 40);
};

/**
 * Sugerencia de username con la convención del contrato §2:
 * `nombre.apellido` → `inicial+apellido` → `base2`, `base3`…
 * `taken` son los usernames que ya existen en este cliente.
 */
export function suggestUsername(name: string, taken: ReadonlySet<string>): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return "";

  const first = words[0]!;
  const last = words[words.length - 1]!;
  const base = asUsername(words.length > 1 ? `${first[0]}${last}` : first);

  const candidates: string[] = [];
  if (words.length > 1) candidates.push(asUsername(`${first}.${last}`));
  candidates.push(base);
  for (const candidate of candidates) {
    if (USERNAME_PATTERN.test(candidate) && !taken.has(candidate)) return candidate;
  }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}${i}`.slice(0, 40);
    if (USERNAME_PATTERN.test(candidate) && !taken.has(candidate)) return candidate;
  }
  return base;
}

/** Mismo orden que `GET /clients/:id/users`: activos primero y luego por nombre. */
const sortUsers = (users: ClientUser[]) =>
  [...users].sort((a, b) =>
    a.active === b.active ? a.name.localeCompare(b.name, "es") : a.active ? -1 : 1
  );

/** Teléfono listo para `wa.me`: 10 dígitos locales se asumen de México. */
function whatsappPhone(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 10 ? `52${digits}` : digits;
}

/**
 * Tarjeta «Usuarios» del detalle del cliente (contrato §6):
 * listado de usuarios de la app con sus roles y acciones, y los diálogos de
 * alta, edición, reset y contraseña temporal (que solo se muestra una vez).
 */
export default function ClientUsersCard({ client }: { client: ClientRef }) {
  const notify = useNotify();
  const [users, setUsers] = useState<ClientUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<ClientUser | null>(null);
  const [deactivating, setDeactivating] = useState<ClientUser | null>(null);
  const [resetting, setResetting] = useState<ClientUser | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [secret, setSecret] = useState<{ title: string; user: ClientUser; password: string } | null>(null);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setUsers(sortUsers(await listClientUsers(client.id)));
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setLoading(false);
    }
  }, [client.id]);

  const loadRoles = useCallback(async () => {
    setRolesError("");
    setRolesLoading(true);
    try {
      setRoles(await listRoles(client.product.id));
    } catch (e) {
      setRoles([]);
      setRolesError(errorOf(e));
    } finally {
      setRolesLoading(false);
    }
  }, [client.product.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const taken = useMemo(() => new Set((users ?? []).map((u) => u.username.toLowerCase())), [users]);

  const replaceUser = (updated: ClientUser) =>
    setUsers((prev) => (prev ? sortUsers(prev.map((u) => (u.id === updated.id ? updated : u))) : prev));

  const toggleActive = async (user: ClientUser) => {
    setBusyId(user.id);
    try {
      const updated = await updateClientUser(client.id, user.id, { active: !user.active });
      replaceUser(updated);
      notify(updated.active ? `${updated.name} puede volver a entrar` : `${updated.name} desactivado`);
    } catch (e) {
      notify(clientUserError(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmReset = async () => {
    if (!resetting) return;
    setResetBusy(true);
    try {
      const result = await resetClientUserPassword(client.id, resetting.id);
      replaceUser(result.user);
      setResetting(null);
      setSecret({ title: "Contraseña restablecida", user: result.user, password: result.temporaryPassword });
    } catch (e) {
      notify(clientUserError(e), "error");
    } finally {
      setResetBusy(false);
    }
  };

  const userActions = (user: ClientUser) => (
    <>
      <IconAction label={`Editar a ${user.name}`} onClick={() => setEditUser(user)} disabled={busyId !== null}>
        <LuPencil size={15} />
      </IconAction>
      <IconAction
        label={`Restablecer contraseña de ${user.name}`}
        tone="primary"
        onClick={() => setResetting(user)}
        disabled={busyId !== null}
      >
        <LuKeyRound size={15} />
      </IconAction>
      {user.active ? (
        <IconAction
          label={`Desactivar a ${user.name}`}
          tone="danger"
          onClick={() => setDeactivating(user)}
          disabled={busyId !== null}
        >
          <LuShieldOff size={15} />
        </IconAction>
      ) : (
        <IconAction
          label={`Activar a ${user.name}`}
          tone="success"
          onClick={() => void toggleActive(user)}
          disabled={busyId !== null}
        >
          <LuShieldCheck size={15} />
        </IconAction>
      )}
    </>
  );

  return (
    <Card
      title="Usuarios"
      subtitle="Personas que entran a la app del cliente, con sus roles."
      actions={
        <ITButton size="sm" icon={<LuUserPlus size={14} />} onClick={() => setCreateOpen(true)}>
          Nuevo usuario
        </ITButton>
      }
    >
      {error ? (
        <div className="flex flex-col gap-3">
          <ITAlert variant="error" title="No se pudieron cargar los usuarios">
            {error}
          </ITAlert>
          <div>
            <ITButton size="sm" variant="outlined" onClick={() => void load()}>
              Reintentar
            </ITButton>
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando usuarios">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : !users || users.length === 0 ? (
        <Empty
          title="Todavía no hay usuarios"
          description="Crea el primer acceso para que el equipo del cliente entre a la app con su rol."
          action={
            <ITButton size="sm" icon={<LuUserPlus size={14} />} onClick={() => setCreateOpen(true)}>
              Crear primer usuario
            </ITButton>
          }
        />
      ) : (
        <>
          {/* Escritorio: tabla con las mismas acciones en la fila. */}
          <div className="hidden lg:block">
            <TableWrap className="min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <Th>Usuario</Th>
                  <Th>Roles</Th>
                  <Th>Último acceso</Th>
                  <Th>Estado</Th>
                  <Th>
                    <span className="block text-right">Acciones</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Initials name={user.name} size="sm" />
                        <div className="min-w-0">
                          <span className="block font-medium text-slate-900 dark:text-white">{user.name}</span>
                          <span className="block font-mono text-xs text-slate-500 dark:text-slate-400">@{user.username}</span>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {user.roles.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <ITChip
                              key={role.id}
                              label={role.name}
                              size="sm"
                              variant="outlined"
                              color={role.active ? "info" : "gray"}
                              className={role.active ? "" : "opacity-70"}
                            />
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Sin roles</span>
                      )}
                    </Td>
                    <Td>
                      <span
                        className="text-slate-500 dark:text-slate-400"
                        title={user.lastLoginAt ? dateText(user.lastLoginAt) : undefined}
                      >
                        {agoText(user.lastLoginAt)}
                      </span>
                    </Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1">
                        {user.active ? (
                          <ITBadget color="success" label="Activo" size="sm" />
                        ) : (
                          <ITBadget color="gray" label="Inactivo" size="sm" />
                        )}
                        {user.mustChangePassword && (
                          <ITBadget color="warning" variant="outlined" size="sm" label="Debe cambiar contraseña" />
                        )}
                      </span>
                    </Td>
                    <Td>
                      <span className="inline-flex w-full justify-end gap-1">{userActions(user)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>

          {/* Móvil: tarjetas con la misma información y acciones. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {users.map((user) => (
              <li key={user.id} className="rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Initials name={user.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">@{user.username}</p>
                    </div>
                  </div>
                  {user.active ? (
                    <ITBadget color="success" label="Activo" size="sm" />
                  ) : (
                    <ITBadget color="gray" label="Inactivo" size="sm" />
                  )}
                </div>

                {user.roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <ITChip
                        key={role.id}
                        label={role.name}
                        size="sm"
                        variant="outlined"
                        color={role.active ? "info" : "gray"}
                        className={role.active ? "" : "opacity-70"}
                      />
                    ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>Último acceso: {agoText(user.lastLoginAt)}</span>
                  {user.mustChangePassword && <ITBadget color="warning" variant="outlined" size="sm" label="Debe cambiar contraseña" />}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <ITButton
                    size="sm"
                    variant="outlined"
                    icon={<LuPencil size={13} />}
                    disabled={busyId !== null}
                    onClick={() => setEditUser(user)}
                  >
                    Editar
                  </ITButton>
                  <ITButton
                    size="sm"
                    variant="outlined"
                    color="primary"
                    icon={<LuKeyRound size={13} />}
                    disabled={busyId !== null}
                    onClick={() => setResetting(user)}
                  >
                    Reset contraseña
                  </ITButton>
                  {user.active ? (
                    <ITButton
                      size="sm"
                      variant="text"
                      color="danger"
                      icon={<LuShieldOff size={13} />}
                      disabled={busyId !== null}
                      onClick={() => setDeactivating(user)}
                    >
                      Desactivar
                    </ITButton>
                  ) : (
                    <ITButton
                      size="sm"
                      variant="text"
                      color="success"
                      icon={<LuShieldCheck size={13} />}
                      disabled={busyId !== null}
                      onClick={() => void toggleActive(user)}
                    >
                      Activar
                    </ITButton>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            La contraseña temporal solo se muestra una vez, al crear el usuario o al restablecerla. La Central nunca
            guarda ni muestra contraseñas.
          </p>
        </>
      )}

      {createOpen && (
        <NewUserDialog
          client={client}
          roles={roles}
          rolesLoading={rolesLoading}
          rolesError={rolesError}
          onRetryRoles={() => void loadRoles()}
          taken={taken}
          onClose={() => setCreateOpen(false)}
          onCreated={(result) => {
            setUsers((prev) => sortUsers([...(prev ?? []), result.user]));
            setError("");
            setCreateOpen(false);
            setSecret({ title: "Usuario creado", user: result.user, password: result.temporaryPassword });
          }}
        />
      )}

      {editUser && (
        <EditUserDialog
          client={client}
          user={editUser}
          roles={roles}
          rolesError={rolesError}
          taken={taken}
          onClose={() => setEditUser(null)}
          onSaved={(updated) => {
            replaceUser(updated);
            setEditUser(null);
            notify("Usuario actualizado");
          }}
        />
      )}

      <ITConfirmDialog
        isOpen={resetting !== null}
        onClose={() => setResetting(null)}
        onConfirm={() => void confirmReset()}
        loading={resetBusy}
        title={`¿Restablecer la contraseña de ${resetting?.name ?? ""}?`}
        message="Se generará una contraseña temporal nueva y se mostrará una sola vez. La actual dejará de funcionar y la persona tendrá que cambiarla al entrar."
        confirmLabel="Restablecer"
        cancelLabel="Cancelar"
        variant="primary"
      />

      <ITConfirmDialog
        isOpen={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          const user = deactivating;
          setDeactivating(null);
          if (user) await toggleActive(user);
        }}
        title={`¿Desactivar a ${deactivating?.name ?? ""}?`}
        message="No podrá entrar a la app hasta que lo reactives. Sus datos y roles se conservan."
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        variant="danger"
      />

      {secret && (
        <TemporaryPasswordDialog
          title={secret.title}
          client={client}
          user={secret.user}
          password={secret.password}
          onClose={() => setSecret(null)}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Selector de roles                                                   */
/* ------------------------------------------------------------------ */

function RolePicker({
  roles,
  value,
  onChange,
  disabled,
}: {
  roles: Role[];
  value: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  if (roles.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No hay roles activos en el producto.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles del usuario">
      {roles.map((role) => {
        const selected = value.includes(role.key);
        return (
          <ITChip
            key={role.id}
            label={`${role.name}${role.active ? "" : " (inactivo)"}`}
            size="sm"
            color={selected ? "primary" : "gray"}
            variant={selected ? "soft" : "outlined"}
            selected={selected}
            disabled={disabled}
            onClick={() => toggle(role.key)}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alta de usuario                                                     */
/* ------------------------------------------------------------------ */

function NewUserDialog({
  client,
  roles,
  rolesLoading,
  rolesError,
  onRetryRoles,
  taken,
  onClose,
  onCreated,
}: {
  client: ClientRef;
  roles: Role[];
  rolesLoading: boolean;
  rolesError: string;
  onRetryRoles: () => void;
  taken: ReadonlySet<string>;
  onClose: () => void;
  onCreated: (result: CreatedClientUser) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggested = useMemo(() => suggestUsername(name, taken), [name, taken]);
  const shown = usernameTouched ? username : suggested;
  const options = useMemo(() => roles.filter((role) => role.active), [roles]);

  const usernameOk = USERNAME_PATTERN.test(shown);
  const usernameTaken = shown.length > 0 && taken.has(shown.toLowerCase());
  const usernameError =
    shown.length > 0 && !usernameOk
      ? "Solo minúsculas, números, punto, guion o guion bajo; debe empezar con letra (3–40)."
      : usernameTaken
        ? "Ese usuario ya existe en este cliente."
        : undefined;
  const nameOk = name.trim().length >= 2;
  const valid = nameOk && usernameOk && !usernameTaken && roleKeys.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const body: NewClientUserBody = { name: name.trim(), roles: roleKeys };
      if (shown) body.username = shown;
      onCreated(await createClientUser(client.id, body));
    } catch (err) {
      setError(clientUserError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ITDialog
      isOpen
      onClose={onClose}
      title="Nuevo usuario"
      className="w-[min(94vw,540px)] max-h-[92dvh] overflow-y-auto"
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <ITInput
          name="name"
          label="Nombre completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Asael Amaro"
          maxLength={80}
          required
          autoFocus
          error={name.length > 0 && !nameOk ? "Escribe al menos 2 caracteres." : undefined}
        />

        <div>
          <ITInput
            name="username"
            label="Usuario"
            value={shown}
            onChange={(e) => {
              const next = e.target.value.toLowerCase().replace(/\s+/g, "");
              // Al vaciar el campo vuelve a la sugerencia calculada desde el nombre.
              if (!next) {
                setUsernameTouched(false);
                setUsername("");
                return;
              }
              setUsernameTouched(true);
              setUsername(next);
            }}
            placeholder={suggested || "nombre.apellido"}
            maxLength={40}
            required
            error={usernameError}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Se sugiere a partir del nombre y puedes cambiarlo. Es único dentro de este cliente.
          </p>
        </div>

        <div>
          <p className="axc-eyebrow mb-2 text-slate-400 dark:text-slate-500">Roles</p>
          {rolesLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Cargando roles…</p>
          ) : rolesError ? (
            <div className="flex flex-col gap-2">
              <ITAlert variant="error" title="No se pudieron cargar los roles">
                {rolesError}
              </ITAlert>
              <div>
                <ITButton size="sm" variant="outlined" type="button" onClick={onRetryRoles}>
                  Reintentar
                </ITButton>
              </div>
            </div>
          ) : (
            <RolePicker roles={options} value={roleKeys} onChange={setRoleKeys} disabled={busy} />
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Mínimo un rol. Los roles definen lo que puede hacer dentro de la app.
          </p>
        </div>

        <ITAlert variant="warning" title="Contraseña temporal">
          Al guardar se genera una contraseña temporal y se muestra una sola vez. La persona deberá cambiarla la primera
          vez que entre.
        </ITAlert>

        {error && <ITAlert variant="error">{error}</ITAlert>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <ITButton type="button" variant="text" color="gray" onClick={onClose}>
            Cancelar
          </ITButton>
          <ITButton type="submit" disabled={!valid || busy}>
            {busy ? "Creando…" : "Crear usuario"}
          </ITButton>
        </div>
      </form>
    </ITDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Edición de usuario                                                  */
/* ------------------------------------------------------------------ */

function EditUserDialog({
  client,
  user,
  roles,
  rolesError,
  taken,
  onClose,
  onSaved,
}: {
  client: ClientRef;
  user: ClientUser;
  roles: Role[];
  rolesError: string;
  taken: ReadonlySet<string>;
  onClose: () => void;
  onSaved: (updated: ClientUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [roleKeys, setRoleKeys] = useState(user.roles.map((role) => role.key));
  const [active, setActive] = useState(user.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const initialRoleKeys = useMemo(() => user.roles.map((role) => role.key), [user.roles]);
  const rolesChanged = [...roleKeys].sort().join(",") !== [...initialRoleKeys].sort().join(",");

  /** Catálogo activo + los roles que ya tiene el usuario, aunque estén inactivos. */
  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: Role[] = [];
    for (const role of [...roles, ...user.roles]) {
      if (seen.has(role.key)) continue;
      seen.add(role.key);
      if (role.active || initialRoleKeys.includes(role.key)) list.push(role);
    }
    return list;
  }, [roles, user.roles, initialRoleKeys]);

  /** El API solo acepta roles activos al guardar; un rol inactivo conservado no se puede reenviar. */
  const inactiveSelected = roleKeys.some((key) => options.find((role) => role.key === key)?.active === false);
  const blockedByInactive = rolesChanged && inactiveSelected;

  const cleanName = name.trim();
  const cleanUsername = username.trim().toLowerCase();
  const nameOk = cleanName.length >= 2;
  const usernameOk = USERNAME_PATTERN.test(cleanUsername);
  const usernameTaken = cleanUsername !== user.username.toLowerCase() && taken.has(cleanUsername);
  const usernameError =
    cleanUsername.length > 0 && !usernameOk
      ? "Solo minúsculas, números, punto, guion o guion bajo; debe empezar con letra (3–40)."
      : usernameTaken
        ? "Ese usuario ya existe en este cliente."
        : undefined;
  const dirty = cleanName !== user.name || cleanUsername !== user.username || rolesChanged || active !== user.active;
  const valid = nameOk && usernameOk && !usernameTaken && roleKeys.length > 0 && !blockedByInactive;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !dirty || busy) return;
    const patch: ClientUserPatch = {};
    if (cleanName !== user.name) patch.name = cleanName;
    if (cleanUsername !== user.username) patch.username = cleanUsername;
    if (rolesChanged) patch.roles = roleKeys;
    if (active !== user.active) patch.active = active;

    setBusy(true);
    setError("");
    try {
      onSaved(await updateClientUser(client.id, user.id, patch));
    } catch (err) {
      setError(clientUserError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ITDialog
      isOpen
      onClose={onClose}
      title={`Editar a ${user.name}`}
      className="w-[min(94vw,540px)] max-h-[92dvh] overflow-y-auto"
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <ITInput
          name="name"
          label="Nombre completo"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          autoFocus
          error={name.length > 0 && !nameOk ? "Escribe al menos 2 caracteres." : undefined}
        />

        <ITInput
          name="username"
          label="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
          maxLength={40}
          required
          error={usernameError}
        />

        <div>
          <p className="axc-eyebrow mb-2 text-slate-400 dark:text-slate-500">Roles</p>
          {rolesError && (
            <div className="mb-2">
              <ITAlert variant="warning">No se pudo refrescar el catálogo de roles; se muestran los roles actuales.</ITAlert>
            </div>
          )}
          <RolePicker roles={options} value={roleKeys} onChange={setRoleKeys} disabled={busy} />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Mínimo un rol.</p>
          {blockedByInactive && (
            <div className="mt-2">
              <ITAlert variant="warning">
                Un rol inactivo no se puede guardar. Quita los roles marcados como inactivos para poder asignar el resto.
              </ITAlert>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-800">
          <ITCheckbox
            label="Usuario activo"
            checked={active}
            onChange={setActive}
            disabled={busy}
            name="active"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Si lo desactivas, no podrá entrar a la app hasta que lo reactives.
          </p>
          {!active && user.mustChangePassword && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              También tiene pendiente cambiar la contraseña temporal.
            </p>
          )}
        </div>

        {error && <ITAlert variant="error">{error}</ITAlert>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-500">{dirty ? "Cambios sin guardar" : "Todo guardado"}</span>
          <div className="flex gap-2">
            <ITButton type="button" variant="outlined" color="gray" onClick={onClose}>
              Cancelar
            </ITButton>
            <ITButton type="submit" disabled={!dirty || !valid || busy}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </ITButton>
          </div>
        </div>
      </form>
    </ITDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Contraseña temporal (se muestra una sola vez)                       */
/* ------------------------------------------------------------------ */

function TemporaryPasswordDialog({
  title,
  client,
  user,
  password,
  onClose,
}: {
  title: string;
  client: ClientRef;
  user: ClientUser;
  password: string;
  onClose: () => void;
}) {
  const notify = useNotify();
  const [copied, setCopied] = useState(false);

  const message = useMemo(
    () =>
      `Hola ${client.name}, este es tu acceso a la app de Axzy:\n\n` +
      `Usuario: ${user.username}\n` +
      `Contraseña temporal: ${password}\n\n` +
      "La app te pedirá cambiarla la primera vez que entres. No compartas esta contraseña.",
    [client.name, user.username, password]
  );
  const phone = whatsappPhone(client.phone);
  const whatsapp = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      notify("No se pudo copiar automáticamente. Selecciona el texto y cópialo a mano.", "error");
    }
  };

  return (
    <ITDialog
      isOpen
      onClose={onClose}
      title={title}
      className="w-[min(94vw,480px)] max-h-[92dvh] overflow-y-auto"
    >
      <div className="flex flex-col gap-4">
        <ITAlert variant="warning" title="Guarda estos datos ahora">
          La contraseña temporal se muestra una sola vez. Si cierras esta ventana sin copiarla, tendrás que restablecerla
          de nuevo.
        </ITAlert>

        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Contraseña temporal generada por la Central.</p>
        </div>

        <div>
          <p className="axc-eyebrow mb-1 text-slate-400 dark:text-slate-500">Usuario</p>
          <code className="block select-all break-all rounded-xl bg-[var(--it-bento-control-bg,#f1f5f9)] px-3 py-2 font-mono text-sm">
            {user.username}
          </code>
        </div>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="axc-eyebrow text-slate-400 dark:text-slate-500">Contraseña temporal</p>
            <ITBadget color="warning" size="sm" label="Solo se muestra una vez" />
          </div>
          <code className="block select-all break-all rounded-xl bg-[var(--it-bento-control-bg,#f1f5f9)] px-3 py-2 font-mono text-sm">
            {password}
          </code>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Al entrar, la app le pedirá cambiarla y la sustituirá por una propia.
        </p>

        <div className="flex flex-wrap gap-2">
          <ITButton
            variant="outlined"
            size="sm"
            icon={copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
            onClick={() => void copy()}
          >
            {copied ? "Datos copiados" : "Copiar usuario y contraseña"}
          </ITButton>
          {whatsapp ? (
            <ITButton
              size="sm"
              color="success"
              variant="outlined"
              icon={<LuMessageCircle size={14} />}
              onClick={() => window.open(whatsapp, "_blank", "noopener,noreferrer")}
            >
              Enviar por WhatsApp
            </ITButton>
          ) : (
            <ITButton size="sm" variant="text" color="gray" disabled title="Agrega un teléfono al cliente para enviárselo">
              Sin teléfono para WhatsApp
            </ITButton>
          )}
          <ITButton size="sm" className="ml-auto" onClick={onClose}>
            Listo
          </ITButton>
        </div>
      </div>
    </ITDialog>
  );
}
