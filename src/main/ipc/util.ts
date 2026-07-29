export function success<T>(data: T): { success: true; data: T } {
  return { success: true as const, data }
}

export function error(msg: string): { success: false; error: string } {
  return { success: false as const, error: msg }
}
