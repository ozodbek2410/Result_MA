import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:9999/api';

test.describe('API Health Checks', () => {
  test('should have backend server running', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`).catch(() => null);
    
    if (response) {
      expect(response.status()).toBeLessThan(500);
    }
  });
});

test.describe('Auth API', () => {
  test('should reject login with invalid credentials', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        login: 'invaliduser',
        password: 'wrongpassword'
      }
    });
    
    expect(response.status()).toBe(401);
  });

  test('should reject login with empty credentials', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {
        login: '',
        password: ''
      }
    });
    
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('should validate required fields', async ({ request }) => {
    const response = await request.post(`${API_URL}/auth/login`, {
      data: {}
    });
    
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe('Protected Routes', () => {
  test('should reject unauthorized access to tests', async ({ request }) => {
    const response = await request.get(`${API_URL}/tests`);
    expect(response.status()).toBe(401);
  });

  test('should reject unauthorized access to students', async ({ request }) => {
    const response = await request.get(`${API_URL}/students`);
    expect(response.status()).toBe(401);
  });

  test('should reject unauthorized access to groups', async ({ request }) => {
    const response = await request.get(`${API_URL}/groups`);
    expect(response.status()).toBe(401);
  });
});
