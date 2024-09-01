export const config = {
  domainSource: "https://quickcamera.ca", // Your WeWeb app preview link
  patterns: [
      {
          pattern: "/product/[^/]+",
          metaDataEndpoint: "https://lfbxzrylbkxjryzzvftv.supabase.co/rest/v1/rpc/get_product_meta"
      }
  ]
};
