import { v2 as cloudinary } from 'cloudinary';
import * as cheerio from 'cheerio';

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
    
    const ebayUrl = 'https://www.ebay.com/sch/i.html?_nkw=alkaline+trio&LH_Complete=1&LH_Sold=1&_ipg=240';
    
    console.log('Fetching eBay page...');
    const response = await fetch(ebayUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    if (!response.ok) {
      throw new Error(`eBay returned ${response.status}`);
    }
    
    const html = await response.text();
    console.log('Parsing HTML...');
    
    const $ = cheerio.load(html);
    const listings = [];
    
    // eBay's search results are in list items with class 's-item'
    $('.s-item').each((index, element) => {
      try {
        const $item = $(element);
        
        // Skip the "Shop on eBay" header item
        if ($item.hasClass('s-item--before-first-detail-separator')) return;
        
        const title = $item.find('.s-item__title').text().trim();
        const priceText = $item.find('.s-item__price').text().trim();
        const link = $item.find('.s-item__link').attr('href');
        const soldDateText = $item.find('.s-item__title--tag').text().trim() || 
                            $item.find('.s-item__endedDate').text().trim() ||
                            $item.find('.POSITIVE').text().trim();
        
        // Extract seller info
        const sellerElement = $item.find('.s-item__seller-info-text');
        const seller = sellerElement.text().trim().replace('Seller: ', '') || 'Unknown';
        
        // Extract shipping cost
        const shippingText = $item.find('.s-item__shipping').text().trim();
        
        // Parse price (remove $ and convert to number)
        const priceMatch = priceText.match(/[\d,]+\.\d{2}/);
        const price = priceMatch ? priceMatch[0].replace(',', '') : '0';
        
        // Parse shipping cost
        let shippingCost = '0';
        if (shippingText.includes('Free')) {
          shippingCost = '0';
        } else {
          const shippingMatch = shippingText.match(/[\d,]+\.\d{2}/);
          if (shippingMatch) {
            shippingCost = shippingMatch[0].replace(',', '');
          }
        }
        
        // Try to extract item ID from URL
        const itemIdMatch = link ? link.match(/\/itm\/(\d+)/) : null;
        const itemId = itemIdMatch ? itemIdMatch[1] : '';
        
        // Only add if we have minimum required data
        if (title && title !== 'Shop on eBay' && price !== '0') {
          listings.push({
            soldDate: soldDateText || new Date().toISOString(),
            title: title,
            price: price,
            currency: 'USD',
            shippingCost: shippingCost,
            shippingCurrency: 'USD',
            seller: seller,
            listingUrl: link || '',
            itemId: itemId
          });
        }
      } catch (itemError) {
        console.error('Error parsing item:', itemError);
      }
    });
    
    console.log(`Scraped ${listings.length} listings`);

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