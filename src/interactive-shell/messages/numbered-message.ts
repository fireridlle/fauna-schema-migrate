export type MessageFun = (id?: number) => JSX.Element

export interface NumberedMessage {
  id: number
  fun: MessageFun
}
