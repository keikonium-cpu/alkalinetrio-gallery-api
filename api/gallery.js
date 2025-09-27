import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
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
      direction: 'desc', // Newest first
      fields: 'public_id,created_at,secure_url' // Only needed fields
    });

    // Extract image data (limit to last 10 if too many)
    const images = result.resources.slice(0, 10).map(img => ({
      url: img.secure_url,
      timestamp: img.created_at,
      publicId: img.public_id
    }));

    res.status(200).json({ images });
  } catch (error) {
    console.error('Gallery API error:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
}