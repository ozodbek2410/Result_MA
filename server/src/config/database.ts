import mongoose from 'mongoose';
import compression from 'compression';

export const connectDB = async () => {
  try {
    // Оптимизированные настройки подключения
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system', {
      maxPoolSize: 50, // Увеличено для большей нагрузки
      minPoolSize: 5,  // Увеличено минимальное количество
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      family: 4,
      // Оптимизации производительности
      maxIdleTimeMS: 30000, // Закрывать неактивные соединения через 30 сек
      compressors: ['zlib'], // Сжатие данных между клиентом и сервером
      zlibCompressionLevel: 6 // Уровень сжатия (1-9)
    });

    // Включаем автоматическое создание индексов в development
    mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');
    
    // Включаем строгий режим для запросов
    mongoose.set('strictQuery', true);
    
    // Включаем кэширование запросов
    mongoose.set('bufferCommands', false); // Отключаем буферизацию для быстрого fail
    
    // Отключаем логи Mongoose (createIndex и т.д.)
    mongoose.set('debug', false);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Pool size: ${(conn.connection as any).client?.options?.maxPoolSize || 'default'}`);
    console.log('⚡ Database optimization enabled');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1);
  }
};
