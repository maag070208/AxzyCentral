import { Router } from "express";
import { asyncHandler, HttpError } from "../errors";
import { MENU_TEMPLATES, menuTemplate } from "../lib/menu-templates";

/** Plantillas de menú que trae la Central (Taquería, Sushi, Pizzería). Solo lectura. */
export const menuTemplatesRouter = Router();

menuTemplatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(
      MENU_TEMPLATES.map((t) => ({ key: t.key, name: t.name, categories: t.data.categories.length, products: t.data.products.length })),
    );
  })
);

menuTemplatesRouter.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const t = menuTemplate(req.params.key);
    if (!t) throw new HttpError(404, "MENU_TEMPLATE_NOT_FOUND", "Esa plantilla de menú no existe");
    res.json(t);
  })
);
