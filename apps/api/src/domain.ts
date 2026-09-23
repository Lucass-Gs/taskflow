import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import { Db, Queryable } from "./db";
import { AuthRequest } from "./auth";
const uuid = z.uuid();
const task = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(3000).default(""),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
});
async function member(db: Queryable, user: string, workspace: string) {
  const m = (
    await db.query(
      "SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2",
      [workspace, user],
    )
  ).rows[0];
  if (!m) throw new NotFoundException("Workspace não encontrado.");
  return m;
}
async function project(db: Queryable, user: string, id: string) {
  const p = (
    await db.query(
      "SELECT p.* FROM projects p JOIN memberships m ON m.workspace_id=p.workspace_id WHERE p.id=$1 AND m.user_id=$2",
      [uuid.parse(id), user],
    )
  ).rows[0];
  if (!p) throw new NotFoundException("Projeto não encontrado.");
  return p;
}
@Controller("api")
class TasksController {
  constructor(private readonly db: Db) {}
  @Get("workspaces") async workspaces(@Req() r: AuthRequest) {
    return (
      await this.db.query(
        "SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.name",
        [r.user.id],
      )
    ).rows;
  }
  @Post("workspaces") async createWorkspace(
    @Req() r: AuthRequest,
    @Body() body: unknown,
  ) {
    const { name } = z
      .object({ name: z.string().trim().min(2).max(80) })
      .parse(body);
    return this.db.tx(async (c) => {
      const w = (
        await c.query("INSERT INTO workspaces(name) VALUES($1) RETURNING *", [
          name,
        ])
      ).rows[0];
      await c.query("INSERT INTO memberships VALUES($1,$2,'admin')", [
        w.id,
        r.user.id,
      ]);
      return w;
    });
  }
  @Post("workspaces/:id/members") async addMember(
    @Req() r: AuthRequest,
    @Param("id") wid: string,
    @Body() body: unknown,
  ) {
    const { email } = z.object({ email: z.email() }).parse(body);
    return this.db.tx(async (c) => {
      if ((await member(c, r.user.id, uuid.parse(wid))).role !== "admin")
        throw new ForbiddenException("Somente administradores.");
      const u = (
        await c.query("SELECT id FROM users WHERE email=$1", [
          email.toLowerCase(),
        ])
      ).rows[0];
      if (!u)
        throw new BadRequestException(
          "Usuário precisa criar uma conta primeiro.",
        );
      await c.query(
        "INSERT INTO memberships VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
        [wid, u.id],
      );
      return { ok: true };
    });
  }
  @Get("workspaces/:id/projects") async projects(
    @Req() r: AuthRequest,
    @Param("id") wid: string,
  ) {
    await member(this.db, r.user.id, uuid.parse(wid));
    return (
      await this.db.query(
        "SELECT * FROM projects WHERE workspace_id=$1 ORDER BY name",
        [wid],
      )
    ).rows;
  }
  @Post("workspaces/:id/projects") async createProject(
    @Req() r: AuthRequest,
    @Param("id") wid: string,
    @Body() body: unknown,
  ) {
    const { name } = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(body);
    await member(this.db, r.user.id, uuid.parse(wid));
    return (
      await this.db.query(
        "INSERT INTO projects(workspace_id,name) VALUES($1,$2) RETURNING *",
        [wid, name],
      )
    ).rows[0];
  }
  @Get("projects/:id/tasks") async tasks(
    @Req() r: AuthRequest,
    @Param("id") pid: string,
    @Query() query: unknown,
  ) {
    await project(this.db, r.user.id, pid);
    const q = z
      .object({
        q: z.string().max(120).default(""),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(query);
    const values = [pid, "%" + q.q + "%"];
    const total = Number(
      (
        await this.db.query(
          "SELECT count(*) FROM tasks WHERE project_id=$1 AND title ILIKE $2",
          values,
        )
      ).rows[0].count,
    );
    return {
      items: (
        await this.db.query(
          "SELECT * FROM tasks WHERE project_id=$1 AND title ILIKE $2 ORDER BY created_at DESC,id LIMIT 60 OFFSET $3",
          [...values, (q.page - 1) * 60],
        )
      ).rows,
      total,
      page: q.page,
    };
  }
  @Post("projects/:id/tasks") async create(
    @Req() r: AuthRequest,
    @Param("id") pid: string,
    @Body() body: unknown,
  ) {
    const data = task.parse(body);
    return this.db.tx(async (c) => {
      const p = await project(c, r.user.id, pid);
      const t = (
        await c.query(
          "INSERT INTO tasks(project_id,title,description,status) VALUES($1,$2,$3,$4) RETURNING *",
          [pid, data.title, data.description, data.status],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO audit(workspace_id,user_id,action,resource_id) VALUES($1,$2,'task.created',$3)",
        [p.workspace_id, r.user.id, t.id],
      );
      return t;
    });
  }
  @Patch("tasks/:id") async update(
    @Req() r: AuthRequest,
    @Param("id") tid: string,
    @Body() body: unknown,
  ) {
    const data = z
      .object({
        title: z.string().trim().min(1).max(160).optional(),
        description: z.string().max(3000).optional(),
        status: z.enum(["todo", "doing", "done"]).optional(),
        version: z.number().int().positive(),
      })
      .parse(body);
    return this.db.tx(async (c) => {
      const old = (
        await c.query(
          "SELECT t.*,p.workspace_id FROM tasks t JOIN projects p ON p.id=t.project_id JOIN memberships m ON m.workspace_id=p.workspace_id WHERE t.id=$1 AND m.user_id=$2",
          [uuid.parse(tid), r.user.id],
        )
      ).rows[0];
      if (!old) throw new NotFoundException("Tarefa não encontrada.");
      const result = await c.query(
        "UPDATE tasks SET title=$1,description=$2,status=$3,version=version+1,updated_at=now() WHERE id=$4 AND version=$5 RETURNING *",
        [
          data.title ?? old.title,
          data.description ?? old.description,
          data.status ?? old.status,
          tid,
          data.version,
        ],
      );
      if (!result.rowCount)
        throw new ConflictException(
          "Outra pessoa alterou esta tarefa. Recarregue antes de editar.",
        );
      await c.query(
        "INSERT INTO audit(workspace_id,user_id,action,resource_id) VALUES($1,$2,'task.updated',$3)",
        [old.workspace_id, r.user.id, tid],
      );
      return result.rows[0];
    });
  }
  @Delete("tasks/:id") async remove(
    @Req() r: AuthRequest,
    @Param("id") tid: string,
    @Body() body: unknown,
  ) {
    const { version } = z
      .object({ version: z.number().int().positive() })
      .parse(body);
    return this.db.tx(async (c) => {
      const old = (
        await c.query(
          "SELECT t.*,p.workspace_id FROM tasks t JOIN projects p ON p.id=t.project_id JOIN memberships m ON m.workspace_id=p.workspace_id WHERE t.id=$1 AND m.user_id=$2",
          [uuid.parse(tid), r.user.id],
        )
      ).rows[0];
      if (!old) throw new NotFoundException();
      if (
        !(
          await c.query("DELETE FROM tasks WHERE id=$1 AND version=$2", [
            tid,
            version,
          ])
        ).rowCount
      )
        throw new ConflictException("Tarefa alterada por outra pessoa.");
      await c.query(
        "INSERT INTO audit(workspace_id,user_id,action,resource_id) VALUES($1,$2,'task.deleted',$3)",
        [old.workspace_id, r.user.id, tid],
      );
      return { ok: true };
    });
  }
  @Get("workspaces/:id/audit") async audit(
    @Req() r: AuthRequest,
    @Param("id") wid: string,
  ) {
    await member(this.db, r.user.id, uuid.parse(wid));
    return (
      await this.db.query(
        "SELECT a.*,u.name FROM audit a JOIN users u ON u.id=a.user_id WHERE workspace_id=$1 ORDER BY id DESC LIMIT 50",
        [wid],
      )
    ).rows;
  }
}
@Module({ controllers: [TasksController], providers: [Db] })
export class DomainModule {}
