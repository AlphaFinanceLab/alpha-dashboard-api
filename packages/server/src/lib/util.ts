import { format, utcToZonedTime } from 'date-fns-tz';

export type RequiredNotNull<T> = {[P in keyof T]: NonNullable<T[P]>};
export type Ensure<T, K extends keyof T> = T & RequiredNotNull<Pick<T, K>>
export type IUnwrapPromise<T> = T extends PromiseLike<infer U> ? U : T

export const startOrEndOfDayUTC = (date: Date, getEndOfDay?: boolean) => {
    const ret = new Date(date);
    if (getEndOfDay) {
        ret.setUTCHours(23,59,59,999);
    } else {
        ret.setUTCHours(0,0,0,0);
    }
    return ret;
};

export const formatInTimeZone = (date: Date, fmt: string, tz: string) => format(
    utcToZonedTime(date, tz), 
    fmt, 
    { timeZone: tz },
);

/**
 * an async fn that will set a timeout of n milliseconds before resolving
 * e.g.: `await delay(100)`
 */
 export async function delay(milliseconds: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
}

