import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // List up to 500 images in 'screenshots' folder (sorted by created_at descending for newest first)
    const result = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'upload',
      prefix: 'screenshots', // Your folder
      max_results: 500, // Adjust if >500 images
      direction: -1, // -1 for descending order (newest first)
    });

    // Sort by created_at timestamp to ensure proper ordering
    const resources = (result.resources || []).sort((a, b) => {
      return new Date(b.created_at) - new Date(a.created_at);
    });

    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const totalImages = resources.length;
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const images = resources.slice(startIdx, endIdx).map(img => ({
      url: img.secure_url,
      timestamp: img.created_at,
      publicId: img.public_id
    }));

    res.status(200).json({
      images,
      total: totalImages,
      page,
      pageSize
    });
  } catch (error) {
    console.error('Gallery API error:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
}