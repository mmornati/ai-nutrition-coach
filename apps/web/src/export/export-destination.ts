/** Where a serialized export goes. The filename is a hint the destination may honour. */
export interface ExportDestination {
  write(input: {
    readonly filename: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array;
  }): Promise<ExportDeliveryOutcome>;
}

/** `cancelled`: the person dismissed the share sheet, so nothing was delivered. */
export type ExportDeliveryOutcome = 'downloaded' | 'shared' | 'cancelled';
