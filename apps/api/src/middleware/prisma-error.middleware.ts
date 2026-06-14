import { Prisma } from "@prisma/client";

/** Prisma 错误映射后的 HTTP 响应结构体。 */
export interface PrismaHttpError {
  statusCode: number;
  code: string;
  message: string;
}

/** 判断 error 是否为 Prisma 已知请求错误（P2xxx）。 */
export function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/**
 * 将 Prisma 已知请求错误码映射为 HTTP 友好错误。
 * 仅对 P2xxx 错误生效；其他错误返回 null 交给上层兜底。
 */
export function handlePrismaError(error: unknown): PrismaHttpError | null {
  if (!isPrismaError(error)) {
    return null;
  }

  switch (error.code) {
    // UNIQUE constraint violation
    case "P2002": {
      const target = Array.isArray(error.meta?.target)
        ? (error.meta.target as string[]).join(", ")
        : "unknown";
      return {
        statusCode: 409,
        code: "CONFLICT",
        message: `Unique constraint failed on: ${target}`
      };
    }

    // Foreign key constraint violation
    case "P2003":
      return {
        statusCode: 400,
        code: "BAD_REQUEST",
        message: "Foreign key constraint failed"
      };

    // Record not found (update/delete targeting non-existent row)
    case "P2025":
      return {
        statusCode: 404,
        code: "NOT_FOUND",
        message: (error.meta?.cause as string | undefined) ?? "Record not found"
      };

    default:
      return {
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: `Prisma error ${error.code}`
      };
  }
}
