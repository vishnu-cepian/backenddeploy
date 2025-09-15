import { AppDataSource } from "../../config/data-source.mjs";
import { Settings } from "../../entities/Settings.mjs";

export const seedSettings = async () => {
    try {
        await AppDataSource.initialize();

        const settingsRepo = AppDataSource.getRepository(Settings);

        const defaultSettings = [
            {
                key: "platform_fee_percent",
                value: "10",
                type: "number"
            },
            {
                key: "vendor_fee_percent",
                value: "20",
                type: "number"
            },
            {
                key: "ad_banner_01",
                value: null,
                type: "string"
            },
            {
                key: "ad_banner_02",
                value: null,
                type: "string"
            },
            {
                key: "ad_banner_03",
                value: null,
                type: "string"
            },
            
            {
                key: "ad_banner_04",
                value: null,
                type: "string"
            },
        ];

        for (const setting of defaultSettings) {
            const existingSetting = await settingsRepo.findOne({ where: { key: setting.key } });
            if (!existingSetting) {
                await settingsRepo.save(setting);
            }
        }

        console.log("Settings seeded successfully");
    } catch (error) {
        console.error("Error seeding settings", error);
    } finally {
        await AppDataSource.destroy();
    }
}

seedSettings();