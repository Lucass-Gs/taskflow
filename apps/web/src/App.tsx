import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  api,
  useSession,
  Login,
  Shell,
  Loading,
  Notice,
  Empty,
  type User,
} from "./shared";
type Workspace = { id: string; name: string; role: string };
type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  version: number;
};
const statuses = [
  ["todo", "A fazer"],
  ["doing", "Em andamento"],
  ["done", "Concluído"],
];
export default function App() {
  const s = useSession();
  if (s.loading) return <Loading />;
  if (!s.user)
    return (
      <Login
        title="Taskflow"
        subtitle="Organize o trabalho. Compartilhe decisões. Transforme tarefas em entregas."
        onLogin={s.setUser}
      />
    );
  return <Board user={s.user} logout={() => s.setUser(null)} />;
}
function Board({ user, logout }: { user: User; logout: () => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]),
    [wid, setWid] = useState(""),
    [projects, setProjects] = useState<Project[]>([]),
    [pid, setPid] = useState(""),
    [tasks, setTasks] = useState<Task[]>([]),
    [query, setQuery] = useState(
      new URLSearchParams(location.search).get("q") || "",
    ),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [audit, setAudit] = useState<any[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  async function loadWorkspaces() {
    const ws = await api<Workspace[]>("/workspaces");
    setWorkspaces(ws);
    setWid((old) => old || ws[0]?.id || "");
  }
  useEffect(() => {
    loadWorkspaces().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setPid("");
    setProjects([]);
    setTasks([]);
    setAudit([]);
    if (wid)
      api<Project[]>("/workspaces/" + wid + "/projects")
        .then((p) => {
          if (active) {
            setProjects(p);
            setPid(p[0]?.id || "");
            setPage(1);
          }
        })
        .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [wid]);
  async function reload() {
    if (!pid) return;
    const g = ++generation.current;
    const result = await api(
      "/projects/" +
        pid +
        "/tasks?q=" +
        encodeURIComponent(query) +
        "&page=" +
        page,
    );
    if (g === generation.current) {
      setTasks(result.items);
      setTotal(result.total);
    }
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) reload().catch((e) => setError(e.message));
    }, 180);
    const url = new URL(location.href);
    query ? url.searchParams.set("q", query) : url.searchParams.delete("q");
    history.replaceState(null, "", url);
    return () => {
      active = false;
      generation.current++;
      clearTimeout(timer);
    };
  }, [pid, query, page]);
  async function run(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(task: Task, status: string) {
    const before = tasks;
    setTasks((all) =>
      all.map((t) => (t.id === task.id ? { ...t, status } : t)),
    );
    try {
      const updated = await api<Task>("/tasks/" + task.id, "PATCH", {
        status,
        version: task.version,
      });
      setTasks((all) => all.map((t) => (t.id === task.id ? updated : t)));
    } catch (e) {
      setTasks(before);
      throw e;
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/projects/" + pid + "/tasks", "POST", { title, description });
      setTitle("");
      setDescription("");
      dialog.current?.close();
      await reload();
    });
  }
  return (
    <Shell title="taskflow" user={user} onLogout={logout}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU TIME, EM MOVIMENTO</span>
          <h1>Menos ruído. Mais entregas.</h1>
          <p>
            Um quadro compartilhado, com alterações protegidas contra conflitos.
          </p>
        </div>
        <button disabled={!pid} onClick={() => dialog.current?.showModal()}>
          + Nova tarefa
        </button>
      </div>
      <Notice error={error} />
      <div className="toolbar">
        <select
          aria-label="Workspace"
          value={wid}
          onChange={(e) => setWid(e.target.value)}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Projeto"
          value={pid}
          onChange={(e) => {
            setPid(e.target.value);
            setPage(1);
          }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Buscar tarefa"
          placeholder="Buscar tarefa…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <button
          className="ghost"
          disabled={busy || !pid}
          onClick={() => run(reload)}
        >
          Atualizar
        </button>
      </div>
      <div className="stats">
        {statuses.map(([key, label]) => (
          <div className="stat" key={key}>
            <small>{label} · nesta página</small>
            <strong>{tasks.filter((t) => t.status === key).length}</strong>
          </div>
        ))}
      </div>
      {pid ? (
        <div className="kanban">
          {statuses.map(([key, label]) => (
            <section className="column" key={key}>
              <h3>
                {label}
                <span>●</span>
              </h3>
              {tasks
                .filter((t) => t.status === key)
                .map((t) => (
                  <article className="task" key={t.id}>
                    <span className="tag">PROJETO</span>
                    <h4>{t.title}</h4>
                    <p>{t.description}</p>
                    <select
                      aria-label={"Status de " + t.title}
                      disabled={busy}
                      value={t.status}
                      onChange={(e) => run(() => move(t, e.target.value))}
                    >
                      {statuses.map(([value, name]) => (
                        <option key={value} value={value}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <div className="task-actions">
                      <small>Versão {t.version}</small>
                      <button
                        className="ghost"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Excluir esta tarefa?"))
                            run(async () => {
                              await api("/tasks/" + t.id, "DELETE", {
                                version: t.version,
                              });
                              await reload();
                            });
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              {!tasks.some((t) => t.status === key) && (
                <Empty>Nenhuma tarefa nesta etapa.</Empty>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty>Crie um workspace e um projeto para começar.</Empty>
      )}
      <div className="toolbar" style={{ marginTop: 20 }}>
        <button
          className="ghost"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ← Anterior
        </button>
        <span className="fine">
          Página {page} · {total} tarefas
        </span>
        <button
          className="ghost"
          disabled={page * 60 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima →
        </button>
      </div>
      <details className="panel">
        <summary>Workspace e colaboração</summary>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              const w = await api("/workspaces", "POST", {
                name: f.get("name"),
              });
              await loadWorkspaces();
              setWid(w.id);
            });
          }}
        >
          <label>
            Novo workspace
            <input name="name" required minLength={2} />
          </label>
          <button disabled={busy}>Criar workspace</button>
        </form>
        {wid && (
          <>
            <form
              className="form-row"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  const p = await api(
                    "/workspaces/" + wid + "/projects",
                    "POST",
                    { name: f.get("name") },
                  );
                  setProjects((old) => [...old, p]);
                  setPid(p.id);
                });
              }}
            >
              <label>
                Novo projeto
                <input name="name" required minLength={2} />
              </label>
              <button disabled={busy}>Criar projeto</button>
            </form>
            {workspaces.find((w) => w.id === wid)?.role === "admin" && (
              <form
                className="form-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  run(async () => {
                    await api("/workspaces/" + wid + "/members", "POST", {
                      email: f.get("email"),
                    });
                    alert("Membro adicionado.");
                  });
                }}
              >
                <label>
                  E-mail de membro cadastrado
                  <input name="email" type="email" required />
                </label>
                <button disabled={busy}>Adicionar</button>
              </form>
            )}
            <button
              className="ghost"
              onClick={() =>
                run(async () =>
                  setAudit(await api("/workspaces/" + wid + "/audit")),
                )
              }
            >
              Ver auditoria
            </button>
            {audit.map((a) => (
              <p className="fine" key={a.id}>
                {a.name} · {a.action} ·{" "}
                {new Date(a.created_at).toLocaleString("pt-BR")}
              </p>
            ))}
          </>
        )}
      </details>
      <dialog ref={dialog}>
        <form onSubmit={create}>
          <h2>Nova tarefa</h2>
          <label>
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={160}
              autoFocus
            />
          </label>
          <label>
            Descrição
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={3000}
            />
          </label>
          <Notice error={error} />
          <div className="modal-actions">
            <button
              className="ghost"
              type="button"
              onClick={() => dialog.current?.close()}
            >
              Cancelar
            </button>
            <button disabled={busy}>Criar tarefa</button>
          </div>
        </form>
      </dialog>
    </Shell>
  );
}
