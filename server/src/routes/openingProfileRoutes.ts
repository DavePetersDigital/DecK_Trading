import { Router } from 'express'
import {
  createOpeningProfileController,
  deleteOpeningProfileController,
  listOpeningProfilesController,
  updateOpeningProfileController,
} from '../controllers/openingProfileController.js'

export const openingProfileRoutes = Router()

openingProfileRoutes.get('/', listOpeningProfilesController)
openingProfileRoutes.post('/', createOpeningProfileController)
openingProfileRoutes.patch('/:id', updateOpeningProfileController)
openingProfileRoutes.delete('/:id', deleteOpeningProfileController)
