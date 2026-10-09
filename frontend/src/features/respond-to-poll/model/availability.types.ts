export type AvailabilityKind = 'UNAVAILABLE' | 'IF_NEEDED' | 'PREFERRED';
export type AvailabilityBrush = AvailabilityKind | 'CLEAR';
export type SaveState = 'LOADING' | 'IDLE' | 'DIRTY' | 'SAVING' | 'SAVED' | 'ERROR';
