
const log = (msg: string) => print(msg);

const formatTime = (microSeconds: number): string => {
    if (!microSeconds || microSeconds < 0) return '0:00';
    const totalSeconds = Math.floor(microSeconds / 1000000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export { log, formatTime };
