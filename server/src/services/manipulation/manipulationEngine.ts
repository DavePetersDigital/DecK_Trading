// Selects the manipulation algorithm named by an Opening Profile.

import type { ProfileManipulationMode } from '../openingProfile/openingProfileRules.js'
import { goldSpecificAlgorithm } from './goldSpecificManipulation.js'
import { normalAlgorithm } from './normalManipulation.js'
import type { ManipulationAlgorithm, ManipulationInput, ManipulationResult } from './manipulationTypes.js'

const ALGORITHMS: Record<ProfileManipulationMode, ManipulationAlgorithm> = {
  gold_specific: goldSpecificAlgorithm,
  normal: normalAlgorithm,
}

export function getManipulationAlgorithm(mode: ProfileManipulationMode): ManipulationAlgorithm {
  return ALGORITHMS[mode] ?? normalAlgorithm
}

export function evaluateManipulation(mode: ProfileManipulationMode, input: ManipulationInput): ManipulationResult {
  return getManipulationAlgorithm(mode).evaluate(input)
}
