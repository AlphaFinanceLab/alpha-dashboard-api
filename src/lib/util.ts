// import EthDater from 'ethereum-block-by-date';
// import Web3 from 'web3';
import { format, utcToZonedTime } from 'date-fns-tz';

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

// type IValidEveryPeriod = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes';
// export const getFirstBlockEveryHourWithinPeriod = (
//     web3: Web3,
//     period: IValidEveryPeriod,
//     startDate: Date,
//     endDate: Date,

// ) => {
//     const dater = new EthDater(web3);
//     return dater.getEvery(period, startDate, endDate, 1, false);
// }
