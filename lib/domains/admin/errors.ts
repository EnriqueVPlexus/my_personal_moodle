export class DuplicateEmailError extends Error {
  constructor() {
    super('email already exists')
    this.name = 'DuplicateEmailError'
  }
}
