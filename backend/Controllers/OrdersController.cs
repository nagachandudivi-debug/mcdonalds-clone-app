using System.Threading;
using backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private static int _nextOrderId;

    // POST /api/orders
    [HttpPost]
    public ActionResult<OrderCreatedResponse> CreateOrder([FromBody] CreateOrderRequest? body)
    {
        if (body is null)
            return BadRequest(new { message = "Request body is required." });

        if (string.IsNullOrWhiteSpace(body.CustomerName))
            return BadRequest(new { message = "Customer name is required." });

        if (body.Items is null || body.Items.Count == 0)
            return BadRequest(new { message = "Add at least one item to the order." });

        var id = Interlocked.Increment(ref _nextOrderId);

        return Ok(new OrderCreatedResponse
        {
            OrderId = id,
            CustomerName = body.CustomerName.Trim(),
        });
    }
}
