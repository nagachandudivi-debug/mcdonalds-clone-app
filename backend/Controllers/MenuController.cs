using backend.Models;
using Microsoft.AspNetCore.Mvc;

namespace backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MenuController : ControllerBase
{
    // Hardcoded menu for learning—replace with a database later.
    private static readonly List<MenuItem> SampleMenu =
    [
        new()
        {
            Id = 1,
            Name = "Big Stack Burger",
            Category = "Burgers",
            Description = "Two beef patties, cheese, lettuce, pickles, and special sauce on a toasted bun.",
            Price = 6.99m,
            ImageUrl = "/images/big-stack-burger.jpg"
        },
        new()
        {
            Id = 2,
            Name = "Cheese Deluxe",
            Category = "Burgers",
            Description = "Single flame-style patty with melted cheese, tomato, onion, and mayo.",
            Price = 5.49m,
            ImageUrl = "/images/cheese-deluxe.jpg"
        },
        new()
        {
            Id = 3,
            Name = "Crispy Chicken Sandwich",
            Category = "Chicken",
            Description = "Crispy chicken fillet with mayo and pickles on a potato bun.",
            Price = 5.99m,
            ImageUrl = "/images/crispy-chicken-sandwich.jpg"
        },
        new()
        {
            Id = 4,
            Name = "Nugget Box (6 pc)",
            Category = "Chicken",
            Description = "Six golden chicken bites—great for dipping.",
            Price = 4.29m,
            ImageUrl = "/images/nugget-box.jpg"
        },
        new()
        {
            Id = 5,
            Name = "Classic Fries",
            Category = "Fries",
            Description = "Hot, salted fries—crispy outside, fluffy inside.",
            Price = 2.99m,
            ImageUrl = "/images/classic-fries.jpg"
        },
        new()
        {
            Id = 6,
            Name = "Cola (Medium)",
            Category = "Drinks",
            Description = "Chilled fountain cola with ice.",
            Price = 1.99m,
            ImageUrl = "/images/cola.jpg"
        },
        new()
        {
            Id = 7,
            Name = "Iced Tea",
            Category = "Drinks",
            Description = "Sweet iced tea, freshly brewed flavor.",
            Price = 1.79m,
            ImageUrl = "/images/iced-tea.jpg"
        },
        new()
        {
            Id = 8,
            Name = "Hot Fudge Sundae",
            Category = "Desserts",
            Description = "Vanilla soft serve with warm fudge and a cherry on top.",
            Price = 3.49m,
            ImageUrl = "/images/hot-fudge-sundae.jpg"
        }
    ];

    // GET /api/menu
    [HttpGet]
    public ActionResult<IEnumerable<MenuItem>> GetMenu()
    {
        return Ok(SampleMenu);
    }
}
