export const config = {
    // Available Time-To-Live options in minutes
    ttlOptions: [
        { label: '15 Minutes', value: 15 },
        { label: '30 Minutes', value: 30 },
        { label: '1 Hour', value: 60 },
        { label: '2 Hours', value: 120 },
        { label: '12 Hours', value: 720 },
        { label: '24 Hours', value: 1440 },
        { label: '3 Days', value: 4320 },
        { label: '7 Days', value: 10080 },
    ],
    // Whether to allow "Burn After Reading"
    enableBurnAfterReading: true,
    // Default TTL if none selected (optional, or handled in UI)
    defaultTTL: 60
};
