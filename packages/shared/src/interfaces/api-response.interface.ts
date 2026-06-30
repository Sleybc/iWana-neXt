/**
 * Respuesta estandar de la API iWana neXt.
 * Sigue el patron envelope para consistencia entre endpoints.
 */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    /** Cursor para paginacion basada en keyset */
    cursor?: string;
    /** Total de registros (cuando aplica) */
    total?: number;
  };
}

/**
 * Formato de error estandar segun RFC 7807 (Problem Details for HTTP APIs).
 * Usado en todas las respuestas de error de la plataforma.
 */
export interface ProblemDetail {
  /** URI que identifica el tipo de problema */
  type: string;
  /** Descripcion corta legible por humanos */
  title: string;
  /** Codigo HTTP */
  status: number;
  /** Descripcion detallada especifica a esta instancia */
  detail: string;
  /** URI que identifica la instancia especifica del problema */
  instance?: string;
}
