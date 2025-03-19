import { config } from 'dotenv';

// Tải các biến môi trường từ file .env vào process.env
config();

// Gán các giá trị từ process.env vào các biến môi trường cần thiết
process.env.region = 'us-east-1';
process.env.userPoolId = 'us-east-1_9D4MK1Cno';
process.env.userPoolClientId = 'nlo7qjfe42m9pg7gdlqjecjlt';

// Export một object rỗng để đảm bảo file này được coi là module
export { };