import type { Request, Response } from 'express'
import { OpeningProfileValidationError } from '../services/openingProfile/openingProfileRules.js'
import {
  addOpeningProfile,
  listOpeningProfiles,
  removeOpeningProfile,
  updateOpeningProfile,
} from '../services/openingProfile/openingProfileStore.js'

function sendError(response: Response, error: unknown) {
  if (error instanceof OpeningProfileValidationError) {
    response.status(error.statusCode).json({ success: false, error: error.message })
    return
  }
  const message = error instanceof Error ? error.message : 'Failed to process Opening Profile request.'
  response.status(500).json({ success: false, error: message })
}

export async function listOpeningProfilesController(_request: Request, response: Response) {
  try {
    const profiles = await listOpeningProfiles()
    response.json({ success: true, profiles })
  } catch (error) {
    sendError(response, error)
  }
}

export async function createOpeningProfileController(request: Request, response: Response) {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>
    const profile = await addOpeningProfile(body)
    response.status(201).json({ success: true, profile })
  } catch (error) {
    sendError(response, error)
  }
}

function profileIdParam(request: Request): string {
  const raw = request.params.id
  return String(Array.isArray(raw) ? raw[0] : raw ?? '')
}

export async function updateOpeningProfileController(request: Request, response: Response) {
  try {
    const body = (request.body ?? {}) as Record<string, unknown>
    const profile = await updateOpeningProfile(profileIdParam(request), body)
    response.json({ success: true, profile })
  } catch (error) {
    sendError(response, error)
  }
}

export async function deleteOpeningProfileController(request: Request, response: Response) {
  try {
    await removeOpeningProfile(profileIdParam(request))
    response.json({ success: true })
  } catch (error) {
    sendError(response, error)
  }
}
