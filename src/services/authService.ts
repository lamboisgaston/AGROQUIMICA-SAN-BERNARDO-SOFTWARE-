import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export interface TokenPayload {
  id: string;
  email: string;
  rol: string;
}

export const authService = {
  async registrar(nombre: string, email: string, password: string, rol: string) {
    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email },
    });

    if (usuarioExistente) {
      throw new Error("El email ya está registrado");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const usuario = await prisma.usuario.create({
      data: {
        nombre,
        email,
        password: passwordHash,
        rol: rol as any,
      },
    });

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    };
  },

  async login(email: string, password: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    if (!usuario) {
      throw new Error("Email o contraseña inválidos");
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);

    if (!passwordValida) {
      throw new Error("Email o contraseña inválidos");
    }

    if (!usuario.activo) {
      throw new Error("Usuario desactivado");
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        rol: usuario.rol,
      } as TokenPayload,
      process.env.JWT_SECRET || "secret",
      { expiresIn: "24h" }
    );

    return {
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  },

  async verificarToken(token: string) {
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || "secret"
      ) as TokenPayload;
      return payload;
    } catch (error) {
      throw new Error("Token inválido");
    }
  },
};
