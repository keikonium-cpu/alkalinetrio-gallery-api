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
    
    // Use eBay Finding API (older but still works)
    const ebayAppId = process.env.EBAY_APP_ID;
    
    // Build the Finding API URL
    const params = new URLSearchParams({
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': ebayAppId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': 'alkaline trio',
      'paginationInput.entriesPerPage': '100',
      'paginationInput.pageNumber': '1',
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
      'sortOrder': 'EndTimeSoonest'
    });

    const apiUrl = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;
    
    console.log('Calling eBay API...');
    const response = await fetch(apiUrl);
    
    const responseText = await response.text();
    console.log('eBay API Response Status:', response.status);
    
    if (!response.ok) {
      console.error('eBay Error Response:', responseText.substring(0, 500));
      throw new Error(`eBay API returned ${response.status}: ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse eBay response:', responseText.substring(0, 500));
      throw new Error('Invalid JSON response from eBay');
    }

    console.log('eBay Response ACK:', data.findCompletedItemsResponse?.[0]?.ack?.[0]);
    
    const searchResult = data.findCompletedItemsResponse?.[0];
    
    if (!searchResult || searchResult.ack?.[0] !== 'Success') {
      const errorMsg = searchResult?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Unknown error';
      console.error('eBay API Error:', errorMsg);
      throw new Error(`eBay API error: ${errorMsg}`);
    }

    const items = searchResult.searchResult?.[0]?.item || [];
    console.log(`Found ${items.length} items`);
    
    if (items.length === 0) {
      console.log('No items found, but API call was successful');
    }
    
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

    console.log(`Processed ${listings.length} listings`);

    // Save to Cloudinary as a JSON file
    const jsonData = {
      lastUpdated: new Date().toISOString(),
      totalListings: listings.length,
      listings: listings
    };

    console.log('Uploading to Cloudinary...');
    
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