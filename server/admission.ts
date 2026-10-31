import { HttpError } from './errors.js';
export function createAdmission(limit: number) {
  let active = 0;
  return () => {
    if (active >= limit) throw new HttpError(429, 'Service capacity reached; retry shortly');
    active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        active--;
      }
    };
  };
}
