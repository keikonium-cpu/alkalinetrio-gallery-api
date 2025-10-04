import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: Add a secret token to prevent unauthorized scraping
  const authToken = req.headers['x-cron-secret'] || req.query.secret;
  if (authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting eBay scrape...');
    
    // Fetch sold Alkaline Trio listings from eBay Finding API
    const ebayAppId = process.env.EBAY_APP_ID;
    const searchUrl = new URL('https://svcs.ebay.com/services/search/FindingService/v1');
    
    searchUrl.searchParams.append('OPERATION-NAME', 'findCompletedItems');
    searchUrl.searchParams.append('SERVICE-VERSION', '1.0.0');
    searchUrl.searchParams.append('SECURITY-APPNAME', ebayAppId);
    searchUrl.searchParams.append('RESPONSE-DATA-FORMAT', 'JSON');
    searchUrl.searchParams.append('REST-PAYLOAD', '');
    searchUrl.searchParams.append('keywords', 'alkaline trio');
    searchUrl.searchParams.append('paginationInput.entriesPerPage', '100');
    searchUrl.searchParams.append('itemFilter(0).name', 'SoldItemsOnly');
    searchUrl.searchParams.append('itemFilter(0).value', 'true');
    searchUrl.searchParams.append('sortOrder', 'EndTimeSoonest');

    const response = await fetch(searchUrl.toString());
    
    if (!response.ok) {
      throw new Error(`eBay API returned ${response.status}`);
    }

    const data = await response.json();
    const searchResult = data.findCompletedItemsResponse?.[0];
    
    if (!searchResult || searchResult.ack?.[0] !== 'Success') {
      throw new Error('eBay API request failed');
    }

    const items = searchResult.searchResult?.[0]?.item || [];
    
    // Transform the data into our format
    const listings = items.map(item => {
      const sellingStatus = item.sellingStatus?.[0];
      const shippingInfo = item.shippingInfo?.[0];
      const listingInfo = item.listingInfo?.[0];
      
      return {
        soldDate: listingInfo?.endTime?.[0] || null,
        title: item.title?.[0] || 'Unknown Title',
        price: sellingStatus?.currentPrice?.[0]?.__value__ || '0',
        currency: sellingStatus?.currentPrice?.[0]?.['@currencyId'] || 'USD',
        shippingCost: shippingInfo?.shippingServiceCost?.[0]?.__value__ || '0',
        shippingCurrency: shippingInfo?.shippingServiceCost?.[0]?.['@currencyId'] || 'USD',
        seller: item.sellerInfo?.[0]?.sellerUserName?.[0] || 'Unknown',
        listingUrl: item.viewItemURL?.[0] || '',
        itemId: item.itemId?.[0] || '',
        condition: item.condition?.[0]?.conditionDisplayName?.[0] || 'N/A'
      };
    });

    console.log(`Scraped ${listings.length} listings`);

    // Save to Cloudinary as a JSON file
    const jsonData = {
      lastUpdated: new Date().toISOString(),
      totalListings: listings.length,
      listings: listings
    };

    // Upload JSON to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:application/json;base64,${Buffer.from(JSON.stringify(jsonData)).toString('base64')}`,
      {
        resource_type: 'raw',
        public_id: 'ebay-listings/alkaline-trio-sold',
        overwrite: true,
        invalidate: true
      }
    );

    console.log('Successfully saved to Cloudinary:', uploadResult.public_id);

    res.status(200).json({
      success: true,
      listingsScraped: listings.length,
      lastUpdated: jsonData.lastUpdated,
      cloudinaryUrl: uploadResult.secure_url
    });

  } catch (error) {
    console.error('eBay scrape error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape eBay listings',
      message: error.message 
    });
  }
}