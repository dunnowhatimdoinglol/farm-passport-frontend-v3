import axios from 'axios';

// Your backend URL
const API_URL = 'http://localhost:3001/api';

// Get batch information
export const getBatch = async (batchId) => {
  const response = await axios.get(`${API_URL}/batch/${batchId}`);
  return response.data;
};

// Unlock badge for user
export const unlockBadge = async (email, batchId) => {
  const response = await axios.post(`${API_URL}/unlock-badge`, {
    email,
    batchId
  });
  return response.data;
};

// Get user's badges
export const getUserBadges = async (email) => {
  const response = await axios.get(`${API_URL}/user/${email}/badges`);
  return response.data;
};