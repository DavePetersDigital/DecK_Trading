export const logger = {
  info(message: string) {
    console.log(message)
  },
  error(message: string, error?: unknown) {
    console.error(message, error ?? '')
  },
}
