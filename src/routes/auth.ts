import { Router, Request, Response } from "express";
import { authService } from "../services/authService";

const router = Router();

// POST /auth/registro
router.post("/registro", async (req: Request, res: Response) => {
  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({
        error: "Falta nombre, email, password o rol",
      });
    }

    const rolesValidos = ["DUENO", "GERENTE", "CAJA", "MOSTRADOR"];
    if (!rolesValidos.includes(rol)) {
      return res.status(400).json({
        error: `Rol inválido. Valores válidos: ${rolesValidos.join(", ")}`,
      });
    }

    const usuario = await authService.registrar(nombre, email, password, rol);

    res.status(201).json({
      mensaje: "Usuario registrado exitosamente",
      usuario,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email y contraseña son obligatorios" });
    }

    const resultado = await authService.login(email, password);

    res.json({
      mensaje: "Login exitoso",
      ...resultado,
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

export default router;
