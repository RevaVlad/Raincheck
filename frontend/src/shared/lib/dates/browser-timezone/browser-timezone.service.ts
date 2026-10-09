import { Injectable } from '@angular/core';
import { detectBrowserTimeZone } from '../date.utils';

@Injectable({ providedIn: 'root' })
export class BrowserTimeZoneService {
  readonly timeZone = detectBrowserTimeZone();
}
