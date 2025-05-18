import { Request, Response } from 'express'
import * as authService from '../service/auth.service'

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body
    const { token, user } = await authService.authenticate(email, password)
    res.json({ token, user })
  } catch (err: any) {
    res.status(401).json({ message: err.message })
  }
}

export async function me(req: any, res: Response) {
  try {
    const user = await authService.getCurrentUser(req.userId)
    res.json({ user })
  } catch {
    res.status(400).json({ message: 'Cannot fetch user' })
  }
}
