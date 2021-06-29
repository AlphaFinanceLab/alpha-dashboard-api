/**
 * an async fn that will set a timeout of n milliseconds before resolving
 * e.g.: `await delay(100)`
 */
export async function delay(milliseconds: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(resolve, milliseconds);
    });
}