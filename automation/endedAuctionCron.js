import cron from "node-cron";
import { Auction } from "../models/auctionSchema.js";
import { User } from "../models/userSchema.js";
import { Bid } from "../models/bidSchema.js";
import { sendEmail } from "../utils/sendEmail.js";
import { calculateCommission } from "../controllers/commissionController.js";

export const endedAuctionCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    const now = new Date();
    console.log("Cron for ended auction running...");
    const endedAuctions = await Auction.find({
      endTime: { $lt: now },
      commissionCalculated: false,
    });
    for (const auction of endedAuctions) {
      try {
        const commissionAmount = await calculateCommission(auction._id);
        auction.commissionCalculated = true;
        const highestBidder = await Bid.findOne({
          auctionItem: auction._id,
          amount: auction.currentBid,
        });
        const auctioneer = await User.findById(auction.createdBy);
        auctioneer.unpaidCommission = commissionAmount;
        if (highestBidder) {
          auction.highestBidder = highestBidder.bidder.id;
          await auction.save();
          const bidder = await User.findById(highestBidder.bidder.id);
          await User.findByIdAndUpdate(
            bidder._id,
            {
              $inc: {
                moneySpent: highestBidder.amount,
                auctionsWon: 1,
              },
            },
            { new: true }
          );
          await User.findByIdAndUpdate(
            auctioneer._id,
            {
              $inc: {
                unpaidCommission: commissionAmount,
              },
            },
            { new: true }
          );
          const subject = `Congratulations on Winning the Auction for ${auction.title}`;
          const message =  `
          Dear ${bidder.userName},
      
          We are pleased to inform you that you have won the auction for ${auction.title}. Congratulations on your successful bid!
      
          Before proceeding with payment, kindly contact your auctioneer using the following email: ${auctioneer.email}. Please finalize your payment using one of the following payment methods:
      
          1. **Bank Transfer**:
             - **Account Name**: ${auctioneer.paymentMethods.bankTransfer.bankAccountName}
             - **Account Number**: ${auctioneer.paymentMethods.bankTransfer.bankAccountNumber}
             - **Bank**: ${auctioneer.paymentMethods.bankTransfer.bankName}
             - **IFSC Code**: ${auctioneer.paymentMethods.ifsccode.ifscCode}
      
          2. **UPI Payment**:
             You can transfer the payment via UPI to the following ID: ${auctioneer.paymentMethods.upiid.upiId}
      
          3. **PayPal**:
             Send your payment to this PayPal account: ${auctioneer.paymentMethods.paypal.paypalEmail}
      
          4. **Cash on Delivery (COD)**:
             If you prefer COD, a 20% advance payment is required before delivery.
             You may use any of the above methods to complete this 20% upfront payment.
             The remaining 80% of the total amount will be due upon delivery.
             If you'd like to inspect the condition of the item before finalizing, please contact the auctioneer at: ${auctioneer.email}.
      
          Please ensure that your payment is completed by [Payment Due Date]. Once your payment is confirmed, we will promptly arrange the shipment of your item.
      
          Thank you for your participation in the auction. We look forward to serving you in future auctions.
      
          Best regards,
          BidMaster Team
        `;
          console.log("SENDING EMAIL TO HIGHEST BIDDER");
          sendEmail({ email: bidder.email, subject, message });
          console.log("SUCCESSFULLY EMAIL SEND TO HIGHEST BIDDER");
        } else {
          await auction.save();
        }
      } catch (error) {
        return next(console.error(error || "Some error in ended auction cron"));
      }
    }
  });
};
