// https://github.com/monosux/ethereum-block-by-date
declare module 'ethereum-block-by-date' {
    import Web3 from 'web3';
    // let block = await dater.getDate(
    //     '2016-07-20T13:20:40Z', // Date, required. Any valid moment.js value: string, milliseconds, Date() object, moment() object.
    //     true // Block after, optional. Search for the nearest block before or after the given date. By default true.
    // );

    /* 
        let block = await dater.getDate(
            '2016-07-20T13:20:40Z', // Date, required. Any valid moment.js value: string, milliseconds, Date() object, moment() object.
            true // Block after, optional. Search for the nearest block before or after the given date. By default true.
        );
        // Returns an object:
        {
            date: '2016-07-20T13:20:40Z', // searched date
            block: 1920000, // found block number
            timestamp: 1469020840 // found block timestamp
        }

        // Getting block by period duration. For example: every first block of Monday's noons of October 2019.
        let blocks = await dater.getEvery(
            'weeks', // Period, required. Valid value: years, quarters, months, weeks, days, hours, minutes
            '2019-09-02T12:00:00Z', // Start date, required. Any valid moment.js value: string, milliseconds, Date() object, moment() object.
            '2019-09-30T12:00:00Z', // End date, required. Any valid moment.js value: string, milliseconds, Date() object, moment() object.
            1, // Duration, optional, integer. By default 1.
            true // Block after, optional. Search for the nearest block before or after the given date. By default true.
        );
    */

    type IValidEveryPeriod = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes';
    type IGetDateRet = { date: string; block: number; timestamp: number; }

    class EthDater {
        constructor(web3: Web3);
        //~ We can read 'c.age' from a 'Cat' instance
        // readonly age: number;
        //~ We can invoke 'c.purr()' from a 'Cat' instance
        public getDate(date: Date, searchForNearsetBlockAfter: boolean = true): IGetDateRet;
        public getEvery(
            period: IValidEveryPeriod, // Period, required. Valid value: years, quarters, months, weeks, days, hours, minutes
            startDate: Date,
            endDate: Date,
            getNBlocks: number = 1, // Duration, optional, integer. By default 1.
            searchForNearestBlockAfter: boolean = true, // Block after, optional. Search for the nearest block before or after the given date. By default true.
        ): IGetDateRet[];
    }

    type EthDater = string;

    export default EthDater;
}

// declare namespace 'ethereum-block-by-date' {