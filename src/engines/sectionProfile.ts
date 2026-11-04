// Authored carriageway of the procedural lining and the portal meshes.
// Offsets outside this half-width stay in metres when a bore is widened.
export const PROFILE_HALF = 4.3
export const BASIC_SPACING = 8
export const ENHANCED_SPACING = 4

export interface SectionProfile {
  templateHalf?: number
  basicSpacing?: number
  enhancedSpacing?: number
}

export function basicSpacing(section?: SectionProfile): number {
  return section?.basicSpacing ?? BASIC_SPACING
}

export function enhancedSpacing(section?: SectionProfile): number {
  return section?.enhancedSpacing ?? ENHANCED_SPACING
}

export function profileLateral(local: number, halfWidth: number, templateHalf = PROFILE_HALF): number {
  if (local === 0 || templateHalf === 0) return local === 0 ? 0 : local
  return Math.abs(local) <= templateHalf ? local * halfWidth / templateHalf : local + Math.sign(local) * (halfWidth - templateHalf)
}

export function sectionErrors(section: SectionProfile | undefined): string[] {
  if (!section) return []
  const errors: string[] = []
  if (section.templateHalf !== undefined && (!Number.isFinite(section.templateHalf) || section.templateHalf < 3 || section.templateHalf > 8)) errors.push('断面半宽须为 3～8 m')
  if (section.basicSpacing !== undefined && (!Number.isFinite(section.basicSpacing) || section.basicSpacing < 2 || section.basicSpacing > 30)) errors.push('基本照明间距须为 2～30 m')
  if (section.enhancedSpacing !== undefined && (!Number.isFinite(section.enhancedSpacing) || section.enhancedSpacing < 2 || section.enhancedSpacing > 20)) errors.push('加强照明间距须为 2～20 m')
  return errors
}
