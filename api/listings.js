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
    // Fetch the JSON file from Cloudinary
    const result = await cloudinary.api.resource('ebay-listings/alkaline-trio-sold', {
      resource_type: 'raw'
    });

    // Fetch the actual JSON content
    const jsonResponse = await fetch(result.secure_url);
    
    if (!jsonResponse.ok) {
      throw new Error('Failed to fetch listings data from Cloudinary');
    }

    const data = await jsonResponse.json();

    res.status(200).json({
      success: true,
      lastUpdated: data.lastUpdated,
      totalListings: data.totalListings,
      listings: data.listings
    });

  } catch (error) {
    console.error('Listings API error:', error);
    
    // If the file doesn't exist yet, return empty data
    if (error.error?.http_code === 404) {
      return res.status(200).json({
        success: true,
        lastUpdated: null,
        totalListings: 0,
        listings: [],
        message: 'No listings data available yet. Run the scraper first.'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch listings',
      message: error.message 
    });
  }
}