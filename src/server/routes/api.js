import moment from "moment-timezone";
import { Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm";

import { assets } from "../../client/foundation/utils/UrlUtils.js";
import { BettingTicket, Race, User } from "../../model/index.js";
import { createConnection } from "../typeorm/connection.js";
import { initialize } from "../typeorm/initialize.js";
import { zenginCode } from "zengin-code";

/**
 * @type {import('fastify').FastifyPluginCallback}
 */
export const apiRoute = async (fastify) => {
  fastify.get("/users/me", async (req, res) => {
    const repo = (await createConnection()).getRepository(User);

    if (req.user != null) {
      res.send(req.user);
    } else {
      const user = await repo.save(new User());
      res.send(user);
    }
  });

  fastify.post("/users/me/charge", async (req, res) => {
    if (req.user == null) {
      throw fastify.httpErrors.unauthorized();
    }

    const { amount } = req.body;
    if (typeof amount !== "number" || amount <= 0) {
      throw fastify.httpErrors.badRequest();
    }

    const repo = (await createConnection()).getRepository(User);

    req.user.balance += amount;
    await repo.save(req.user);

    res.status(204).send();
  });

  fastify.get("/hero", async (_req, res) => {
    const url = assets("/images/hero.jpg");
    const hash = Math.random().toFixed(10).substring(2);

    res.send({ hash, url });
  });

  fastify.get("/races", async (req, res) => {
    const since =
      req.query.since != null ? moment.unix(req.query.since) : undefined;
    const until =
      req.query.until != null ? moment.unix(req.query.until) : undefined;

    if (since != null && !since.isValid()) {
      throw fastify.httpErrors.badRequest();
    }
    if (until != null && !until.isValid()) {
      throw fastify.httpErrors.badRequest();
    }

    const repo = (await createConnection()).getRepository(Race);

    const where = {};
    if (since != null && until != null) {
      Object.assign(where, {
        startAt: Between(
          since.utc().format("YYYY-MM-DD HH:mm:ss"),
          until.utc().format("YYYY-MM-DD HH:mm:ss"),
        ),
      });
    } else if (since != null) {
      Object.assign(where, {
        startAt: MoreThanOrEqual(since.utc().format("YYYY-MM-DD HH:mm:ss")),
      });
    } else if (until != null) {
      Object.assign(where, {
        startAt: LessThanOrEqual(since.utc().format("YYYY-MM-DD HH:mm:ss")),
      });
    }

    const races = await repo.find({
      where,
    });

    res.send({ races });
  });

  fastify.get("/races/:raceId", async (req, res) => {
    const repo = (await createConnection()).getRepository(Race);

    const race = await repo.findOne(req.params.raceId, {
      relations: ["entries", "entries.player", "trifectaOdds"],
    });

    if (race === undefined) {
      throw fastify.httpErrors.notFound();
    }

    res.send(race);
  });

  fastify.get("/races/:raceId/betting-tickets", async (req, res) => {
    if (req.user == null) {
      throw fastify.httpErrors.unauthorized();
    }

    const repo = (await createConnection()).getRepository(BettingTicket);
    const bettingTickets = await repo.find({
      where: {
        race: {
          id: req.params.raceId,
        },
        user: {
          id: req.user.id,
        },
      },
    });

    res.send({
      bettingTickets,
    });
  });

  fastify.post("/races/:raceId/betting-tickets", async (req, res) => {
    if (req.user == null) {
      throw fastify.httpErrors.unauthorized();
    }

    if (req.user.balance < 100) {
      throw fastify.httpErrors.preconditionFailed();
    }

    if (typeof req.body.type !== "string") {
      throw fastify.httpErrors.badRequest();
    }

    if (
      !Array.isArray(req.body.key) ||
      req.body.key.some((n) => typeof n !== "number")
    ) {
      throw fastify.httpErrors.badRequest();
    }

    const bettingTicketRepo = (await createConnection()).getRepository(
      BettingTicket,
    );
    const bettingTicket = await bettingTicketRepo.save(
      new BettingTicket({
        key: req.body.key,
        race: {
          id: req.params.raceId,
        },
        type: req.body.type,
        user: {
          id: req.user.id,
        },
      }),
    );

    const userRepo = (await createConnection()).getRepository(User);
    req.user.balance -= 100;
    await userRepo.save(req.user);

    res.send(bettingTicket);
  });

  fastify.get("/zengin-code ", async (_req, res) => {
    const bankCode = req.query.bankCode;
    const branchCode = req.query.branchCode;

    if (bankCode) {
      const bank = zenginCode[bankCode];
      if (!bank) {
        return res.status(404).send({ error: "Bank not found" });
      }
      
      if (branchCode) {
        const branch = bank.branches[branchCode];
        if (!branch) {
          return res.status(404).send({ error: "Branch not found" });
        }
        return res.send({ bank, branch });
      }
      // 指定されていない場合は銀行の情報のみを返す
      return res.send({ bank });
    }

    return res.send(zenginCode);
  });

  fastify.post("/initialize", async (_req, res) => {
    await initialize();
    res.status(204).send();
  });
};
