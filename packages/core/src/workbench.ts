export type WorkbenchIcon = 'chats' | 'skills'

export interface WorkbenchContribution {
  id: string
  title: string
  icon: WorkbenchIcon
  order: number
}
