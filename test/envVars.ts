import { config } from 'dotenv';

// Tải các biến môi trường từ file .env vào process.env
config();

// Gán các giá trị từ process.env vào các biến môi trường cần thiết
process.env.region = process.env.region || 'us-east-1';
process.env.userPoolId = process.env.userPoolId || 'us-east-1_ODRaa1M8z';
process.env.userPoolClientId = process.env.userPoolClientId || '3ucoc78hcjq8m2iosv7cm3smo6';

// Export một object rỗng để đảm bảo file này được coi là module
export { };